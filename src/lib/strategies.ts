import { computeIndicators, type IndicatorBundle } from './indicators'
import type { StrategyId } from './liveLearner'
import type { Bias, Candle } from './types'

export type StrategySignal = {
  id: StrategyId
  bias: Bias
  score: number
  reason: string
}

function biasFromScore(score: number, thresh = 18): Bias {
  if (score >= thresh) return 'bullish'
  if (score <= -thresh) return 'bearish'
  return 'neutral'
}

export type Tape = IndicatorBundle & {
  lastClose: number
  microHigh: number
  microLow: number
  mid: number
  mom3: number
  mom6: number
  closeLoc: number
  volRatio: number
  last: Candle
}

export function tapeFeatures(candles: Candle[], lastClose: number): Tape {
  const ind = computeIndicators(candles, lastClose)
  const last = { ...candles[candles.length - 1]!, close: lastClose }
  last.high = Math.max(last.high, lastClose)
  last.low = Math.min(last.low, lastClose)
  const micro = candles.slice(-8)
  const microHigh = Math.max(...micro.map((c) => c.high), lastClose)
  const microLow = Math.min(...micro.map((c) => c.low), lastClose)
  const mid = (microHigh + microLow) / 2
  const mom3 = lastClose - candles[Math.max(0, candles.length - 4)]!.close
  const mom6 = lastClose - candles[Math.max(0, candles.length - 7)]!.close
  const range = Math.max(1e-9, last.high - last.low)
  const closeLoc = (last.close - last.low) / range
  const vols = candles.slice(-16).map((c) => c.volume)
  const avgVol = vols.reduce((a, b) => a + b, 0) / Math.max(1, vols.length)
  const volRatio = avgVol > 0 ? last.volume / avgVol : 1

  return {
    ...ind,
    lastClose,
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

/** EMA stack + ADX trend strength (library ATR/ADX/EMA). */
export function runTrend(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []

  if (t.lastClose > t.ema9 && t.ema9 > t.ema21 && t.ema21 > t.ema50) {
    score += 30
    bits.push('EMA 9>21>50')
  } else if (t.lastClose < t.ema9 && t.ema9 < t.ema21 && t.ema21 < t.ema50) {
    score -= 30
    bits.push('EMA 9<21<50')
  } else if (t.lastClose > t.ema9 && t.ema9 > t.ema21) {
    score += 18
    bits.push('EMA stack↑')
  } else if (t.lastClose < t.ema9 && t.ema9 < t.ema21) {
    score -= 18
    bits.push('EMA stack↓')
  }

  if (t.adx >= 22) {
    if (t.plusDI > t.minusDI) {
      score += 14
      bits.push(`ADX ${t.adx.toFixed(0)} +DI`)
    } else if (t.minusDI > t.plusDI) {
      score -= 14
      bits.push(`ADX ${t.adx.toFixed(0)} -DI`)
    }
  } else {
    score *= 0.55
    bits.push('weak ADX')
  }

  const stretch =
    (t.lastClose - t.mid) / Math.max(t.atr14, t.microHigh - t.microLow)
  if (score > 0 && stretch > 0.75) {
    score *= 0.35
    bits.push('no chase')
  }
  if (score < 0 && stretch < -0.75) {
    score *= 0.35
    bits.push('no chase')
  }

  return {
    id: 'trend',
    bias: biasFromScore(score),
    score,
    reason: bits.join(' · ') || 'flat trend',
  }
}

/** Bollinger %B + RSI mean reversion (library). */
export function runMeanRevert(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []

  if (t.bbPctB >= 0.95 || t.rsi14 > 70) {
    score -= 28
    bits.push(`fade BB/RSI high (${t.rsi14.toFixed(0)})`)
  } else if (t.bbPctB <= 0.05 || t.rsi14 < 30) {
    score += 28
    bits.push(`fade BB/RSI low (${t.rsi14.toFixed(0)})`)
  } else if (t.bbPctB > 0.75 && t.rsi14 > 60) {
    score -= 12
    bits.push('upper band')
  } else if (t.bbPctB < 0.25 && t.rsi14 < 40) {
    score += 12
    bits.push('lower band')
  }

  if (t.closeLoc < 0.28 && t.last.close > t.last.open) {
    score += 10
    bits.push('lower reject')
  }
  if (t.closeLoc > 0.72 && t.last.close < t.last.open) {
    score -= 10
    bits.push('upper reject')
  }

  // Don't fight strong ADX trends
  if (t.adx > 28) {
    score *= 0.4
    bits.push('ADX damp')
  }

  return {
    id: 'meanRevert',
    bias: biasFromScore(score, 16),
    score,
    reason: bits.join(' · ') || 'mid BB',
  }
}

export function runBreakout(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []
  const nearHigh = t.lastClose >= t.microHigh - t.atr14 * 0.12
  const nearLow = t.lastClose <= t.microLow + t.atr14 * 0.12

  if (nearHigh && t.volRatio > 1.12 && t.macdHist > 0) {
    score += 22
    bits.push('high + MACD↑')
  } else if (nearLow && t.volRatio > 1.12 && t.macdHist < 0) {
    score -= 22
    bits.push('low + MACD↓')
  }

  if (nearHigh && t.closeLoc < 0.4 && t.last.close < t.last.open) {
    score -= 16
    bits.push('failed high')
  }
  if (nearLow && t.closeLoc > 0.6 && t.last.close > t.last.open) {
    score += 16
    bits.push('failed low')
  }

  // Squeeze: BB width tight relative to ATR → breakout preference
  const bbWidth = (t.bbUpper - t.bbLower) / Math.max(1e-9, t.bbMiddle)
  if (bbWidth < t.atrPct / 100 * 1.2 && Math.abs(t.mom3) > t.atr14 * 0.12) {
    score += t.mom3 > 0 ? 10 : -10
    bits.push('BB squeeze')
  }

  return {
    id: 'breakout',
    bias: biasFromScore(score, 16),
    score,
    reason: bits.join(' · ') || 'inside range',
  }
}

/** Stochastic + return z-score momentum. */
export function runMomentum(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []

  if (t.returnZ > 1.1) {
    score += 18
    bits.push(`z ${t.returnZ.toFixed(1)}`)
  } else if (t.returnZ < -1.1) {
    score -= 18
    bits.push(`z ${t.returnZ.toFixed(1)}`)
  }

  if (t.stochK > 80 && t.stochK > t.stochD) {
    score -= 12
    bits.push('stoch OB')
  } else if (t.stochK < 20 && t.stochK < t.stochD) {
    score += 12
    bits.push('stoch OS')
  } else if (t.stochK > t.stochD && t.stochK > 50) {
    score += 8
    bits.push('stoch↑')
  } else if (t.stochK < t.stochD && t.stochK < 50) {
    score -= 8
    bits.push('stoch↓')
  }

  if (t.mom3 > 0 && t.mom6 > 0) {
    score += 12
    bits.push('2-leg↑')
  } else if (t.mom3 < 0 && t.mom6 < 0) {
    score -= 12
    bits.push('2-leg↓')
  }

  if (Math.abs(t.mom3) > t.atr14 * 0.55) {
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

/** Dedicated MACD histogram / cross strategy. */
export function runMacdFlow(t: Tape): StrategySignal {
  let score = 0
  const bits: string[] = []

  if (t.macdHist > 0 && t.macd > t.macdSignal) {
    score += 22
    bits.push('MACD hist+')
  } else if (t.macdHist < 0 && t.macd < t.macdSignal) {
    score -= 22
    bits.push('MACD hist-')
  }

  // Zero-line context
  if (t.macd > 0 && t.macdHist > 0) {
    score += 8
    bits.push('above zero')
  } else if (t.macd < 0 && t.macdHist < 0) {
    score -= 8
    bits.push('below zero')
  }

  // Histogram shrinking = loss of momentum
  if (Math.abs(t.macdHist) < t.atr14 * 0.02 && t.adx < 18) {
    score *= 0.5
    bits.push('flat hist')
  }

  return {
    id: 'macdFlow',
    bias: biasFromScore(score, 14),
    score,
    reason: bits.join(' · ') || 'MACD quiet',
  }
}

export function runAllStrategies(candles: Candle[], lastClose: number) {
  const t = tapeFeatures(candles, lastClose)
  const signals = [
    runTrend(t),
    runMeanRevert(t),
    runBreakout(t),
    runMomentum(t),
    runMacdFlow(t),
  ]
  return { tape: t, signals }
}
