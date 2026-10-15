import type { Bias, Candle } from './types'
import type { StrategyId } from './liveLearner'

export type StrategySignal = {
  id: StrategyId
  bias: Bias
  /** −100…+100 raw conviction before learner weight */
  score: number
  reason: string
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return []
  const k = 2 / (period + 1)
  let prev = values[0]
  const out = [prev]
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 1
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const p = candles[i - 1]
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - p.close),
        Math.abs(c.low - p.close),
      ),
    )
  }
  const slice = trs.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / Math.max(1, slice.length)
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0
  let losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gains += d
    else losses -= d
  }
  if (losses === 0) return 100
  return 100 - 100 / (1 + gains / losses)
}

function biasFromScore(score: number, thresh = 18): Bias {
  if (score >= thresh) return 'bullish'
  if (score <= -thresh) return 'bearish'
  return 'neutral'
}

/** Shared tape features for all strategies (near-price only). */
export function tapeFeatures(candles: Candle[], lastClose: number) {
  const closes = candles.map((c) => c.close)
  closes[closes.length - 1] = lastClose
  const e9 = ema(closes, 9)
  const e21 = ema(closes, 21)
  const ema9 = e9[e9.length - 1]
  const ema21 = e21[e21.length - 1]
  const ema9Prev = e9[Math.max(0, e9.length - 4)]
  const atrVal = atr(candles)
  const rsi14 = rsi(closes, 14)
  const last = { ...candles[candles.length - 1], close: lastClose }
  const micro = candles.slice(-8)
  const microHigh = Math.max(...micro.map((c) => c.high))
  const microLow = Math.min(...micro.map((c) => c.low))
  const mid = (microHigh + microLow) / 2
  const mom3 = lastClose - candles[Math.max(0, candles.length - 4)].close
  const mom6 = lastClose - candles[Math.max(0, candles.length - 7)].close
  const range = Math.max(1e-9, last.high - last.low)
  const closeLoc = (last.close - last.low) / range
  const vols = candles.slice(-16).map((c) => c.volume)
  const avgVol = vols.reduce((a, b) => a + b, 0) / Math.max(1, vols.length)
  const volRatio = avgVol > 0 ? last.volume / avgVol : 1

  return {
    lastClose,
    ema9,
    ema21,
    ema9Slope: ema9 - ema9Prev,
    atrVal,
    rsi14,
    microHigh,
    microLow,
    mid,
    mom3,
    mom6,
    closeLoc,
    volRatio,
    last,
  }
}

export type Tape = ReturnType<typeof tapeFeatures>

export function runTrend(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []
  if (t.lastClose > t.ema9 && t.ema9 > t.ema21) {
    score += 28
    bits.push('EMA stack↑')
  } else if (t.lastClose < t.ema9 && t.ema9 < t.ema21) {
    score -= 28
    bits.push('EMA stack↓')
  }
  if (t.ema9Slope > t.atrVal * 0.04) {
    score += 14
    bits.push('EMA9 rising')
  } else if (t.ema9Slope < -t.atrVal * 0.04) {
    score -= 14
    bits.push('EMA9 falling')
  }
  // Stay near price — fade if already stretched > 0.7 micro range
  const stretch = (t.lastClose - t.mid) / Math.max(t.atrVal, t.microHigh - t.microLow)
  if (score > 0 && stretch > 0.75) {
    score *= 0.35
    bits.push('trim chase')
  }
  if (score < 0 && stretch < -0.75) {
    score *= 0.35
    bits.push('trim chase')
  }
  return {
    id: 'trend',
    bias: biasFromScore(score),
    score,
    reason: bits.join(' · ') || 'flat stack',
  }
}

export function runMeanRevert(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []
  const stretch =
    (t.lastClose - t.mid) / Math.max(t.atrVal * 0.8, (t.microHigh - t.microLow) * 0.5)
  if (stretch > 0.9 || t.rsi14 > 68) {
    score -= 26
    bits.push('fade stretch high')
  } else if (stretch < -0.9 || t.rsi14 < 32) {
    score += 26
    bits.push('fade stretch low')
  }
  // Wick rejection near extremes
  if (t.closeLoc < 0.28 && t.last.close > t.last.open) {
    score += 12
    bits.push('lower reject')
  }
  if (t.closeLoc > 0.72 && t.last.close < t.last.open) {
    score -= 12
    bits.push('upper reject')
  }
  // Don't mean-revert hard against strong EMA slope
  if (Math.abs(t.ema9Slope) > t.atrVal * 0.12) {
    score *= 0.4
    bits.push('trend damp')
  }
  return {
    id: 'meanRevert',
    bias: biasFromScore(score, 16),
    score,
    reason: bits.join(' · ') || 'mid-range',
  }
}

export function runBreakout(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []
  const nearHigh = t.lastClose >= t.microHigh - t.atrVal * 0.15
  const nearLow = t.lastClose <= t.microLow + t.atrVal * 0.15
  if (nearHigh && t.volRatio > 1.15 && t.mom3 > 0) {
    score += 24
    bits.push('probe micro high')
  } else if (nearLow && t.volRatio > 1.15 && t.mom3 < 0) {
    score -= 24
    bits.push('probe micro low')
  }
  // Failed break → reverse lean
  if (nearHigh && t.closeLoc < 0.4 && t.last.close < t.last.open) {
    score -= 18
    bits.push('failed high')
  }
  if (nearLow && t.closeLoc > 0.6 && t.last.close > t.last.open) {
    score += 18
    bits.push('failed low')
  }
  return {
    id: 'breakout',
    bias: biasFromScore(score, 16),
    score,
    reason: bits.join(' · ') || 'inside range',
  }
}

export function runMomentum(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []
  if (t.mom3 > 0 && t.mom6 > 0) {
    score += 22
    bits.push('2-leg↑')
  } else if (t.mom3 < 0 && t.mom6 < 0) {
    score -= 22
    bits.push('2-leg↓')
  } else if (t.mom3 > t.atrVal * 0.15) {
    score += 10
    bits.push('short↑')
  } else if (t.mom3 < -t.atrVal * 0.15) {
    score -= 10
    bits.push('short↓')
  }
  if (t.volRatio > 1.3) {
    score *= 1.15
    bits.push('vol confirm')
  }
  // Cap chase: if move already > 0.55 ATR in 3 bars, fade half
  if (Math.abs(t.mom3) > t.atrVal * 0.55) {
    score *= 0.5
    bits.push('exhaust')
  }
  return {
    id: 'momentum',
    bias: biasFromScore(score, 14),
    score,
    reason: bits.join(' · ') || 'quiet mom',
  }
}

export function runAllStrategies(candles: Candle[], lastClose: number) {
  const t = tapeFeatures(candles, lastClose)
  const signals = [
    runTrend(t),
    runMeanRevert(t),
    runBreakout(t),
    runMomentum(t),
  ]
  return { tape: t, signals }
}
