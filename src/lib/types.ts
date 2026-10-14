export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
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
  regularMarketPrice: number
  previousClose: number | null
  candles: Candle[]
  fetchedAt: number
  source: string
}
