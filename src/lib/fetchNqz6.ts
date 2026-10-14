import type { Candle, MarketSnapshot } from './types'

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
  regularMarketChangePercent?: number
  fulldayPrice?: number
  fulldayChange?: number
  fulldayChangePercent?: number
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

  // Drop Yahoo's duplicate regularMarketTime tick when it isn't a new 5m bucket
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

function alignBar(ts: number): number {
  return Math.floor(ts / BAR_SEC) * BAR_SEC
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
  } else if (livePrice > 0 && expectedBar > last.time) {
    // Start a synthetic forming bar when Yahoo hasn't opened the bucket yet
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

export async function fetchNqz6Snapshot(
  signal?: AbortSignal,
): Promise<MarketSnapshot> {
  // 5m for structure; 1m in parallel for fresher mark when meta ties
  const [five, one] = await Promise.all([
    fetchChart('5m', '5d', signal),
    fetchChart('1m', '1d', signal).catch(() => null),
  ])

  if (!five.candles.length) throw new Error('No valid 5m candles returned')

  const metaA = five.meta
  const metaB = one?.meta
  const pickMeta =
    metaB &&
    (metaB.regularMarketTime ?? 0) >= (metaA.regularMarketTime ?? 0)
      ? metaB
      : metaA

  const livePrice =
    pickMeta.regularMarketPrice ??
    pickMeta.fulldayPrice ??
    five.candles[five.candles.length - 1].close

  const sourceTime =
    pickMeta.regularMarketTime ??
    five.candles[five.candles.length - 1].time ??
    Math.floor(Date.now() / 1000)

  const previousClose =
    pickMeta.previousClose ?? pickMeta.chartPreviousClose ?? null

  let change: number | null =
    pickMeta.fulldayChange != null
      ? pickMeta.fulldayChange
      : previousClose != null
        ? livePrice - previousClose
        : null

  let changePercent: number | null =
    pickMeta.fulldayChangePercent ??
    pickMeta.regularMarketChangePercent ??
    null
  if (changePercent == null && change != null && previousClose) {
    changePercent = (change / previousClose) * 100
  }

  // Prefer 1m last print to nudge forming 5m OHLC when available
  let patched = patchFormingCandle(five.candles, livePrice)
  if (one?.candles.length) {
    const m1 = one.candles[one.candles.length - 1]
    const last5 = patched[patched.length - 1]
    if (m1.time >= last5.time) {
      last5.close = livePrice
      last5.high = Math.max(last5.high, m1.high, livePrice)
      last5.low = Math.min(last5.low, m1.low, livePrice)
      last5.forming = true
    }
  }

  const forming = Boolean(patched[patched.length - 1]?.forming)

  return {
    symbol: pickMeta.symbol ?? metaA.symbol ?? SYMBOL,
    shortName: pickMeta.shortName ?? metaA.shortName ?? 'Nasdaq 100 Dec 26',
    exchange: pickMeta.exchangeName ?? metaA.exchangeName ?? 'CME',
    timezone: pickMeta.timezone ?? metaA.timezone ?? 'America/New_York',
    livePrice,
    regularMarketPrice: livePrice,
    previousClose,
    change,
    changePercent,
    sourceTime,
    candles: patched,
    fetchedAt: Date.now(),
    source: 'Yahoo Finance 5m+1m (proxied)',
    forming,
  }
}
