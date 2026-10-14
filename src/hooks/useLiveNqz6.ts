import { useEffect, useRef, useState } from 'react'
import { analyzeNextCandle } from '../lib/analyzeNextCandle'
import { fetchNqz6Snapshot } from '../lib/fetchNqz6'
import type { MarketSnapshot, NextCandleSuggestion } from '../lib/types'

const POLL_MS = 20_000

export type LiveState = {
  snapshot: MarketSnapshot | null
  suggestion: NextCandleSuggestion | null
  status: 'idle' | 'loading' | 'live' | 'error'
  error: string | null
  lastSuccessAt: number | null
  pollMs: number
}

export function useLiveNqz6(): LiveState {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [suggestion, setSuggestion] = useState<NextCandleSuggestion | null>(
    null,
  )
  const [status, setStatus] = useState<LiveState['status']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    async function tick(isFirst: boolean) {
      if (inFlight.current) return
      inFlight.current = true
      if (isFirst) setStatus('loading')
      try {
        const next = await fetchNqz6Snapshot(controller.signal)
        if (controller.signal.aborted) return
        setSnapshot(next)
        setSuggestion(analyzeNextCandle(next.candles))
        setLastSuccessAt(Date.now())
        setError(null)
        setStatus('live')
      } catch (err) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Fetch failed'
        setError(message)
        setStatus((prev) => (prev === 'live' ? 'live' : 'error'))
      } finally {
        inFlight.current = false
      }
    }

    void tick(true)
    const id = window.setInterval(() => void tick(false), POLL_MS)
    return () => {
      controller.abort()
      window.clearInterval(id)
    }
  }, [])

  return {
    snapshot,
    suggestion,
    status,
    error,
    lastSuccessAt,
    pollMs: POLL_MS,
  }
}
