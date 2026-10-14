import { useEffect, useRef, useState } from 'react'
import { analyzeTwoCandles } from '../lib/analyzeNextCandle'
import { fetchNqz6Snapshot } from '../lib/fetchNqz6'
import { patchFormingFromMark } from '../lib/normalizeCandles'
import type { DualCandleSuggestions, MarkPrint, MarketSnapshot } from '../lib/types'

/** Structure refresh (5m bars). Marks come from the tick SSE — not this poll. */
const STRUCTURE_POLL_MS = 15_000

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

  const inFlight = useRef(false)
  const lastPriceRef = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const snapshotRef = useRef<MarketSnapshot | null>(null)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

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

  // Tick SSE — every Tradovate MD tick hits the UI immediately
  useEffect(() => {
    const es = new EventSource('/api/ticks')
    es.addEventListener('mark', (ev) => {
      try {
        const mark = JSON.parse((ev as MessageEvent).data) as MarkPrint
        applyMark(mark)
      } catch {
        /* ignore bad frame */
      }
    })
    es.addEventListener('status', (ev) => {
      try {
        const st = JSON.parse((ev as MessageEvent).data) as {
          configured?: boolean
          cache?: { status?: string; tickGapUs?: number | null }
        }
        setTradovateConfigured(Boolean(st.configured))
        if (st.cache?.status) setTradovateStatus(st.cache.status)
        if (st.cache?.tickGapUs != null) setTickGapUs(st.cache.tickGapUs)
      } catch {
        /* ignore */
      }
    })
    es.onerror = () => {
      // Browser auto-reconnects EventSource; surface soft warning only
      setError((e) => e ?? 'Tick stream reconnecting…')
    }
    return () => {
      es.close()
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
  }
}
