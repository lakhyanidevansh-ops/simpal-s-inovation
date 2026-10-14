export type Candle = {
  /** Bar open unix seconds — exact 5m epoch */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  /** Exclusive bar end (= time + 300) */
  closeTime?: number
  forming?: boolean
  /** Gap from previous bar open in seconds when > 5m (session break) */
  gapFromPrevSec?: number
}

export type Bias = 'bullish' | 'bearish' | 'neutral'

export type Freshness = 'live' | 'delayed' | 'stale' | 'unavailable'

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

export type MarkPrint = {
  symbol: string
  price: number
  sourceTime: number
  fetchedAt: number
  ageSeconds: number
  freshness: Freshness
  source: string
  previousClose: number | null
  change: number | null
  changePercent: number | null
  bid: number | null
  ask: number | null
  note: string
  tradovateConfigured?: boolean
}

export type MarketSnapshot = {
  symbol: string
  shortName: string
  exchange: string
  timezone: string
  livePrice: number
  regularMarketPrice: number
  previousClose: number | null
  change: number | null
  changePercent: number | null
  sourceTime: number
  candles: Candle[]
  fetchedAt: number
  source: string
  forming: boolean
  mark: MarkPrint
}
