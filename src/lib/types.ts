export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  forming?: boolean
}

export type Bias = 'bullish' | 'bearish' | 'neutral'

export type NextCandleSuggestion = {
  bias: Bias
  lastClose: number
  expectedVsPriorClose: 'higher' | 'lower' | 'unchanged'
  targetHint: string
  invalidation: number
  invalidationNote: string
  oneLiner: string
  structure: string
  keyLevels: { label: string; value: number }[]
  confidence: 'low' | 'moderate' | 'high'
  ema9: number
  ema21: number
  swingHigh: number
  swingLow: number
  analyzedBars: number
}

export type MarketSnapshot = {
  symbol: string
  shortName: string
  exchange: string
  timezone: string
  /** Live mark / last from Yahoo meta (preferred over stale bar close). */
  livePrice: number
  /** Alias kept for older UI bits — same as livePrice. */
  regularMarketPrice: number
  previousClose: number | null
  change: number | null
  changePercent: number | null
  /** Exchange/source time for the live print (unix seconds). */
  sourceTime: number
  candles: Candle[]
  fetchedAt: number
  source: string
  forming: boolean
}
