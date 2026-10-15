import { useEffect, useRef, useState } from 'react'
import {
  analyzeTwoCandles,
  strategyBiasesAt,
} from '../lib/analyzeNextCandle'
import { fetchMark, fetchNqz6Snapshot } from '../lib/fetchNqz6'
import {
  loadLearner,
  recordBarOutcome,
  type LearnerState,
} from '../lib/liveLearner'
import { patchFormingFromMark } from '../lib/normalizeCandles'
import type {
  Bias,
  DualCandleSuggestions,
  MarkPrint,
  MarketSnapshot,
} from '../lib/types'

/** Structure refresh (5m bars). */
const STRUCTURE_POLL_MS = 15_000
/** Mark poll when SSE is unavailable (Netlify functions are short-lived). */
const MARK_POLL_MS = 3_000

export type LiveState = {
  snapshot: MarketSnapshot | null
  suggestions: DualCandleSuggestions | null
  /** @deprecated alias of suggestions.plus1 */
  suggestion: DualCandleSuggestions['plus1'] | null
  status: 'idle' | 'loading' | 'live' | 'error'
  error: string | null
  lastSuccessAt: number | null
  /** Structure poll interval — mark updates are tick-driven when Tradovate is live. */
  pollMs: number
  now: number
  priceFlash: 'up' | 'down' | null
  tickGapUs: number | null
  feedMode: MarkPrint['feedMode'] | null
  tradovateConfigured: boolean
  tradovateStatus: string | null
  tradovateError: string | null
  missingCidSec: boolean
}

export function useLiveNqz6(): LiveState {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [suggestions, setSuggestions] = useState<DualCandleSuggestions | null>(
    null,
  )
  const [status, setStatus] = useState<LiveState['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null)
  const [tickGapUs, setTickGapUs] = useState<number | null>(null)
  const [feedMode, setFeedMode] = useState<MarkPrint['feedMode'] | null>(null)
  const [tradovateConfigured, setTradovateConfigured] = useState(false)
  const [tradovateStatus, setTradovateStatus] = useState<string | null>(null)
  const [tradovateError, setTradovateError] = useState<string | null>(null)
  const [missingCidSec, setMissingCidSec] = useState(false)

  const inFlight = useRef(false)
  const lastPriceRef = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const snapshotRef = useRef<MarketSnapshot | null>(null)
  const learnerRef = useRef<LearnerState>(loadLearner())
  /** Last closed bar open we already scored for learning */
  const learnedBarRef = useRef<number | null>(null)
  /** Pending vote from previous closed bar, checked when next bar closes */
  const pendingVoteRef = useRef<{
    barOpen: number
    votedBias: Bias
    strategyBias: ReturnType<typeof strategyBiasesAt>
  } | null>(null)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  /** Learn from each newly closed 5m bar — reweights strategies live. */
  const learnFromCandles = (candles: MarketSnapshot['candles']) => {
    const closed = candles.filter((c) => !c.forming)
    if (closed.length < 32) return
    const prev = closed[closed.length - 2]
    const lastClosed = closed[closed.length - 1]
    if (!prev || !lastClosed) return

    // When a new bar appears, grade the prediction made at the prior close
    if (
      learnedBarRef.current != null &&
      lastClosed.time > learnedBarRef.current &&
      pendingVoteRef.current &&
      pendingVoteRef.current.barOpen === learnedBarRef.current
    ) {
      const actual =
        lastClosed.close > lastClosed.open
          ? 'up'
          : lastClosed.close < lastClosed.open
            ? 'down'
            : 'flat'
      learnerRef.current = recordBarOutcome({
        state: learnerRef.current,
        strategyBias: pendingVoteRef.current.strategyBias,
        votedBias: pendingVoteRef.current.votedBias,
        actual,
      })
    }

    if (learnedBarRef.current === lastClosed.time) return
    learnedBarRef.current = lastClosed.time
    const hist = closed.slice(0, -1)
    const dual = analyzeTwoCandles(hist, lastClosed.open)
    pendingVoteRef.current = {
      barOpen: lastClosed.time,
      votedBias: dual.plus1.bias,
      strategyBias: strategyBiasesAt(hist, lastClosed.open),
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  const applyMark = (mark: MarkPrint) => {
    setTickGapUs(mark.tickGapUs ?? null)
    setFeedMode(mark.feedMode ?? null)
    setTradovateConfigured(Boolean(mark.tradovateConfigured))
    setTradovateStatus(mark.tradovateStatus ?? null)

    const prev = lastPriceRef.current
    if (prev != null && mark.price !== prev) {
      setPriceFlash(mark.price > prev ? 'up' : 'down')
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setPriceFlash(null), 180)
    }
    lastPriceRef.current = mark.price
    setLastSuccessAt(Date.now())
    setNow(Date.now())

    const cur = snapshotRef.current
    if (!cur) return

    const patched = patchFormingFromMark(cur.candles, mark)
    const next: MarketSnapshot = {
      ...cur,
      livePrice: mark.price,
      regularMarketPrice: mark.price,
      previousClose: mark.previousClose ?? cur.previousClose,
      change: mark.change ?? cur.change,
      changePercent: mark.changePercent ?? cur.changePercent,
      sourceTime: mark.sourceTime,
      fetchedAt: Date.now(),
      source: mark.source,
      forming: Boolean(patched.some((c) => c.forming)),
      candles: patched,
      mark,
      symbol: mark.symbol || cur.symbol,
    }
    setSnapshot(next)
    setSuggestions(analyzeTwoCandles(next.candles, next.livePrice))
    setStatus('live')
    setError(null)
  }

  // Tick SSE (local Vite) + mark poll fallback (Netlify short SSE / failures)
  useEffect(() => {
    let es: EventSource | null = null
    let pollId: number | null = null
    let usePoll = false

    const startPoll = () => {
      if (pollId != null) return
      usePoll = true
      const tick = async () => {
        try {
          const mark = await fetchMark()
          applyMark(mark)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Mark poll failed')
        }
      }
      void tick()
      pollId = window.setInterval(() => void tick(), MARK_POLL_MS)
    }

    try {
      es = new EventSource('/api/ticks')
    } catch {
      startPoll()
      return () => {
        if (pollId != null) window.clearInterval(pollId)
      }
    }

    let gotFrame = false
    es.addEventListener('mark', (ev) => {
      gotFrame = true
      try {
        const mark = JSON.parse((ev as MessageEvent).data) as MarkPrint
        applyMark(mark)
      } catch {
        /* ignore bad frame */
      }
    })
    es.addEventListener('status', (ev) => {
      gotFrame = true
      try {
        const st = JSON.parse((ev as MessageEvent).data) as {
          configured?: boolean
          missing?: { cid?: boolean; sec?: boolean }
          platform?: string
          cache?: {
            status?: string
            tickGapUs?: number | null
            error?: string | null
          }
        }
        setTradovateConfigured(Boolean(st.configured))
        setMissingCidSec(Boolean(st.missing?.cid || st.missing?.sec))
        if (st.cache?.status) setTradovateStatus(st.cache.status)
        if (st.cache?.error != null) setTradovateError(st.cache.error)
        if (st.cache?.tickGapUs != null) setTickGapUs(st.cache.tickGapUs)
        // Netlify functions end after one burst — switch to polling
        if (st.platform === 'netlify' || st.cache?.status === 'netlify') {
          es?.close()
          startPoll()
        }
      } catch {
        /* ignore */
      }
    })
    es.onerror = () => {
      if (!gotFrame || usePoll) {
        es?.close()
        startPoll()
      }
    }

    // If SSE never delivers (broken proxy), poll after 4s
    const watchdog = window.setTimeout(() => {
      if (!gotFrame) {
        es?.close()
        startPoll()
      }
    }, 4000)

    return () => {
      window.clearTimeout(watchdog)
      es?.close()
      if (pollId != null) window.clearInterval(pollId)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Structure (5m candles) — Tradovate bars when live, else delayed Yahoo
  useEffect(() => {
    const controller = new AbortController()

    async function loadStructure(isFirst: boolean) {
      if (inFlight.current) return
      inFlight.current = true
      if (isFirst) setStatus((s) => (s === 'live' ? s : 'loading'))
      try {
        const next = await fetchNqz6Snapshot(controller.signal)
        if (controller.signal.aborted) return

        // Prefer fresher tick mark already on snapshot if newer
        const cur = snapshotRef.current
        const merged =
          cur &&
          cur.mark.feedMode === 'tradovate-tick' &&
          cur.mark.fetchedAt >= next.mark.fetchedAt
            ? {
                ...next,
                livePrice: cur.livePrice,
                mark: cur.mark,
                sourceTime: cur.sourceTime,
                source: cur.source,
                candles: patchFormingFromMark(next.candles, cur.mark),
                forming: true,
              }
            : next

        lastPriceRef.current = merged.livePrice
        learnFromCandles(merged.candles)
        setSnapshot(merged)
        setSuggestions(analyzeTwoCandles(merged.candles, merged.livePrice))
        setFeedMode(merged.mark.feedMode ?? null)
        setTradovateConfigured(Boolean(merged.mark.tradovateConfigured))
        setTradovateStatus(merged.mark.tradovateStatus ?? null)
        setTickGapUs(merged.mark.tickGapUs ?? null)
        setLastSuccessAt(Date.now())
        setNow(Date.now())
        setError(null)
        setStatus('live')
      } catch (err) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Fetch failed'
        setError(message)
        setStatus((s) => (s === 'live' ? 'live' : 'error'))
      } finally {
        inFlight.current = false
      }
    }

    void loadStructure(true)
    const id = window.setInterval(
      () => void loadStructure(false),
      STRUCTURE_POLL_MS,
    )
    return () => {
      controller.abort()
      window.clearInterval(id)
    }
  }, [])

  return {
    snapshot,
    suggestions,
    suggestion: suggestions?.plus1 ?? null,
    status,
    error,
    lastSuccessAt,
    pollMs: STRUCTURE_POLL_MS,
    now,
    priceFlash,
    tickGapUs,
    feedMode,
    tradovateConfigured,
    tradovateStatus,
    tradovateError,
    missingCidSec,
  }
}
