import {
  normalizeFiveMinuteCandles,
  patchFormingFromMark,
} from './normalizeCandles'
import type { Candle, MarkPrint, MarketSnapshot } from './types'

const SYMBOL = 'NQZ26.CME'

type YahooQuote = {
  open?: Array<number | null>
  high?: Array<number | null>
  low?: Array<number | null>
  close?: Array<number | null>
  volume?: Array<number | null>
}

type YahooMeta = {
  symbol?: string
  shortName?: string
  exchangeName?: string
  timezone?: string
  exchangeTimezoneName?: string
  regularMarketPrice?: number
  regularMarketTime?: number
  previousClose?: number
  chartPreviousClose?: number
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: YahooMeta
      timestamp?: number[]
      indicators?: { quote?: YahooQuote[] }
    }>
    error?: { description?: string } | null
  }
}

function parseRawCandles(timestamps: number[], quote: YahooQuote): Candle[] {
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
  return out
}

async function fetchChart(
  interval: string,
  range: string,
  signal?: AbortSignal,
): Promise<{ meta: YahooMeta; candles: Candle[] }> {
  const params = new URLSearchParams({
    interval,
    range,
    includePrePost: 'true',
  })
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(SYMBOL)}?${params}`
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`)
  const data = (await res.json()) as YahooChartResponse
  const result = data.chart?.result?.[0]
  if (!result?.timestamp?.length || !result.indicators?.quote?.[0]) {
    const err = data.chart?.error?.description ?? 'empty chart result'
    throw new Error(`Yahoo chart: ${err}`)
  }
  const raw = parseRawCandles(result.timestamp, result.indicators.quote[0])
  return {
    meta: result.meta ?? {},
    candles: normalizeFiveMinuteCandles(raw),
  }
}

async function fetchMark(signal?: AbortSignal): Promise<MarkPrint> {
  const res = await fetch('/api/mark', {
    signal,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Mark API HTTP ${res.status}`)
  return (await res.json()) as MarkPrint
}

export async function fetchNqz6Snapshot(
  signal?: AbortSignal,
): Promise<MarketSnapshot> {
  const [mark, five] = await Promise.all([
    fetchMark(signal),
    fetchChart('5m', '5d', signal),
  ])

  if (!five.candles.length) throw new Error('No valid 5m candles returned')

  const patched = patchFormingFromMark(five.candles, mark)
  const meta = five.meta
  // Prefer CME exchange timezone for labels; Yahoo often reports EDT
  const exchangeTz =
    meta.exchangeTimezoneName || 'America/Chicago'

  return {
    symbol: mark.symbol || meta.symbol || SYMBOL,
    shortName: meta.shortName ?? 'Nasdaq 100 Dec 26',
    exchange: meta.exchangeName ?? 'CME',
    timezone: exchangeTz,
    livePrice: mark.price,
    regularMarketPrice: mark.price,
    previousClose: mark.previousClose,
    change: mark.change,
    changePercent: mark.changePercent,
    sourceTime: mark.sourceTime,
    candles: patched,
    fetchedAt: Date.now(),
    source: mark.source,
    forming: Boolean(patched.some((c) => c.forming)),
    mark,
  }
}
