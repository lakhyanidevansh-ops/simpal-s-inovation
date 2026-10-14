import { useEffect, useRef, useState } from 'react'
import { analyzeTwoCandles } from '../lib/analyzeNextCandle'
import { fetchNqz6Snapshot } from '../lib/fetchNqz6'
import type { DualCandleSuggestions, MarketSnapshot } from '../lib/types'

const POLL_MS = 3_000

export type LiveState = {
  snapshot: MarketSnapshot | null
  suggestions: DualCandleSuggestions | null
  /** @deprecated alias of suggestions.plus1 */
  suggestion: DualCandleSuggestions['plus1'] | null
  status: 'idle' | 'loading' | 'live' | 'error'
  error: string | null
  lastSuccessAt: number | null
  pollMs: number
  now: number
  priceFlash: 'up' | 'down' | null
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
  const inFlight = useRef(false)
  const lastPriceRef = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function tick(isFirst: boolean) {
      if (inFlight.current) return
      inFlight.current = true
      if (isFirst) setStatus('loading')
      try {
        const next = await fetchNqz6Snapshot(controller.signal)
        if (controller.signal.aborted) return

        const prev = lastPriceRef.current
        if (prev != null && next.livePrice !== prev) {
          setPriceFlash(next.livePrice > prev ? 'up' : 'down')
          if (flashTimer.current) window.clearTimeout(flashTimer.current)
          flashTimer.current = window.setTimeout(() => setPriceFlash(null), 450)
        }
        lastPriceRef.current = next.livePrice

        const dual = analyzeTwoCandles(next.candles, next.livePrice)
        setSnapshot(next)
        setSuggestions(dual)
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

    void tick(true)
    const id = window.setInterval(() => void tick(false), POLL_MS)
    return () => {
      controller.abort()
      window.clearInterval(id)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    }
  }, [])

  return {
    snapshot,
    suggestions,
    suggestion: suggestions?.plus1 ?? null,
    status,
    error,
    lastSuccessAt,
    pollMs: POLL_MS,
    now,
    priceFlash,
  }
}
