import type { Candle, MarketSnapshot } from './types'

const SYMBOL = 'NQZ26.CME'

type YahooQuote = {
  open?: Array<number | null>
  high?: Array<number | null>
  low?: Array<number | null>
  close?: Array<number | null>
  volume?: Array<number | null>
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string
        shortName?: string
        exchangeName?: string
        timezone?: string
        regularMarketPrice?: number
        previousClose?: number
        chartPreviousClose?: number
      }
      timestamp?: number[]
      indicators?: {
        quote?: YahooQuote[]
      }
    }>
    error?: { description?: string } | null
  }
}

function cleanCandles(timestamps: number[], quote: YahooQuote): Candle[] {
  const opens = quote.open ?? []
  const highs = quote.high ?? []
  const lows = quote.low ?? []
  const closes = quote.close ?? []
  const volumes = quote.volume ?? []

  const out: Candle[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const open = opens[i]
    const high = highs[i]
    const low = lows[i]
    const close = closes[i]
    if (open == null || high == null || low == null || close == null) continue
    out.push({
      time: timestamps[i],
      open,
      high,
      low,
      close,
      volume: volumes[i] ?? 0,
    })
  }

  if (out.length >= 2) {
    const last = out[out.length - 1]
    const prev = out[out.length - 2]
    const flat =
      last.high === last.low &&
      last.open === last.close &&
      last.volume === 0 &&
      last.time - prev.time < 60
    if (flat) out.pop()
  }

  return out
}

export async function fetchNqz6Snapshot(
  signal?: AbortSignal,
): Promise<MarketSnapshot> {
  const params = new URLSearchParams({
    interval: '5m',
    range: '5d',
    includePrePost: 'true',
  })
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(SYMBOL)}?${params}`
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Yahoo chart HTTP ${res.status}`)
  }
  const data = (await res.json()) as YahooChartResponse
  const result = data.chart?.result?.[0]
  if (!result?.timestamp?.length || !result.indicators?.quote?.[0]) {
    const err = data.chart?.error?.description ?? 'empty chart result'
    throw new Error(`Yahoo chart: ${err}`)
  }

  const candles = cleanCandles(result.timestamp, result.indicators.quote[0])
  if (!candles.length) throw new Error('No valid 5m candles returned')

  const meta = result.meta ?? {}
  return {
    symbol: meta.symbol ?? SYMBOL,
    shortName: meta.shortName ?? 'Nasdaq 100 Dec 26',
    exchange: meta.exchangeName ?? 'CME',
    timezone: meta.timezone ?? 'America/New_York',
    regularMarketPrice:
      meta.regularMarketPrice ?? candles[candles.length - 1].close,
    previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
    candles,
    fetchedAt: Date.now(),
    source: 'Yahoo Finance (proxied)',
  }
}
