import type { Candle, MarkPrint, MarketSnapshot } from './types'

const SYMBOL = 'NQZ26.CME'
const BAR_SEC = 300

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

function alignBar(ts: number): number {
  return Math.floor(ts / BAR_SEC) * BAR_SEC
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
    if (
      last.time === prev.time ||
      (last.volume === 0 &&
        last.high === last.low &&
        last.open === last.close &&
        last.time - prev.time < 60 &&
        alignBar(last.time) === alignBar(prev.time) &&
        last.time !== alignBar(last.time))
    ) {
      out.pop()
    }
  }

  return out
}

function patchFormingCandle(candles: Candle[], livePrice: number): Candle[] {
  if (!candles.length) return candles
  const next = candles.map((c) => ({ ...c }))
  const last = next[next.length - 1]
  const nowSec = Math.floor(Date.now() / 1000)
  const expectedBar = alignBar(nowSec)
  const incomplete = last.volume === 0 || last.time >= expectedBar - BAR_SEC

  if (last.time === expectedBar || incomplete) {
    last.close = livePrice
    last.high = Math.max(last.high, livePrice, last.open)
    last.low = Math.min(last.low, livePrice, last.open)
    last.forming = true
  } else if (expectedBar > last.time) {
    next.push({
      time: expectedBar,
      open: livePrice,
      high: livePrice,
      low: livePrice,
      close: livePrice,
      volume: 0,
      forming: true,
    })
  } else {
    last.close = livePrice
    last.high = Math.max(last.high, livePrice)
    last.low = Math.min(last.low, livePrice)
    last.forming = true
  }
  return next
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
  return {
    meta: result.meta ?? {},
    candles: cleanCandles(result.timestamp, result.indicators.quote[0]),
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
  // Primary mark from server (Tradovate RT if configured, else delayed Yahoo)
  // Chart OHLC still from Yahoo 5m (structure only) — never pretend chart is RT.
  const [mark, five] = await Promise.all([
    fetchMark(signal),
    fetchChart('5m', '5d', signal),
  ])

  if (!five.candles.length) throw new Error('No valid 5m candles returned')

  const livePrice = mark.price
  const patched = patchFormingCandle(five.candles, livePrice)
  const meta = five.meta

  return {
    symbol: mark.symbol || meta.symbol || SYMBOL,
    shortName: meta.shortName ?? 'Nasdaq 100 Dec 26',
    exchange: meta.exchangeName ?? 'CME',
    timezone: meta.timezone ?? 'America/New_York',
    livePrice,
    regularMarketPrice: livePrice,
    previousClose: mark.previousClose,
    change: mark.change,
    changePercent: mark.changePercent,
    sourceTime: mark.sourceTime,
    candles: patched,
    fetchedAt: Date.now(),
    source: mark.source,
    forming: Boolean(patched[patched.length - 1]?.forming),
    mark,
  }
}
