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

/** Live call for candle +1 or +2 after the forming bucket. */
export type HorizonSuggestion = NextCandleSuggestion & {
  horizon: 1 | 2
  /** CME CT bucket label e.g. 13:45–13:50 */
  bucketLabel: string
  openTime: number
  closeTime: number
}

export type DualCandleSuggestions = {
  plus1: HorizonSuggestion
  plus2: HorizonSuggestion
  /** Back-compat alias = plus1 for older UI bits */
  primary: HorizonSuggestion
}

export type MarkPrint = {
  symbol: string
  price: number
  sourceTime: number
  fetchedAt: number
  ageSeconds: number
  /** Gap between last two Tradovate ticks in microseconds (when streaming). */
  tickGapUs?: number | null
  freshness: Freshness
  source: string
  previousClose: number | null
  change: number | null
  changePercent: number | null
  bid: number | null
  ask: number | null
  note: string
  tradovateConfigured?: boolean
  tradovateStatus?: string
  feedMode?: 'tradovate-tick' | 'yahoo-delayed'
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
