import { BAR_SEC, EXCHANGE_TZ, formatClock } from './time'
import type {
  Bias,
  Candle,
  DualCandleSuggestions,
  HorizonSuggestion,
  NextCandleSuggestion,
  ProjectedBar,
} from './types'

/** Hard cap: projected 5m move never exceeds 1% of price (user accuracy band). */
const MAX_MOVE_PCT = 0.01
const ATR_PERIOD = 14
const HIT_LOOKBACK = 40

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

function atr(candles: Candle[], period = ATR_PERIOD): number {
  if (candles.length < 2) return 0
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
  if (!slice.length) return 0
  return slice.reduce((a, b) => a + b, 0) / slice.length
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
  const rs = gains / losses
  return 100 - 100 / (1 + rs)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function bucketLabel(openSec: number): string {
  const close = openSec + BAR_SEC
  return `${formatClock(openSec, EXCHANGE_TZ)}–${formatClock(close, EXCHANGE_TZ)} CT`
}

function recentSwingHigh(candles: Candle[], lookback: number): number {
  return Math.max(...candles.slice(-lookback).map((c) => c.high))
}

function recentSwingLow(candles: Candle[], lookback: number): number {
  return Math.min(...candles.slice(-lookback).map((c) => c.low))
}

/**
 * Walk-forward: for each closed bar i, score bars[0..i) and check if
 * direction matched the next bar's close vs open. Honest recent hit-rate.
 */
function walkForwardHitRate(candles: Candle[]): {
  hitRate: number
  sample: number
} {
  const closed = candles.filter((c) => !c.forming)
  const start = Math.max(25, closed.length - HIT_LOOKBACK)
  let hits = 0
  let n = 0
  for (let i = start; i < closed.length - 1; i++) {
    const hist = closed.slice(0, i + 1)
    const next = closed[i + 1]
    const { bias } = scoreHorizon(hist, hist[hist.length - 1].close, 1)
    if (bias === 'neutral') continue
    n++
    const up = next.close > next.open
    const down = next.close < next.open
    if ((bias === 'bullish' && up) || (bias === 'bearish' && down)) hits++
  }
  return { hitRate: n ? hits / n : 0.5, sample: n }
}

type ScoreResult = {
  score: number
  bias: Bias
  confidence: NextCandleSuggestion['confidence']
  atrVal: number
  ema9: number
  ema21: number
  rsi14: number
  swingHigh: number
  swingLow: number
  microHigh: number
  microLow: number
  structure: string
}

function scoreHorizon(
  candles: Candle[],
  lastClose: number,
  horizon: 1 | 2,
): ScoreResult {
  const closes = candles.map((c) => c.close)
  closes[closes.length - 1] = lastClose
  const e9 = ema(closes, 9)
  const e21 = ema(closes, 21)
  const ema9 = e9[e9.length - 1]
  const ema21 = e21[e21.length - 1]
  const ema9Prev = e9[Math.max(0, e9.length - 4)]
  const atrVal = atr(candles)
  const rsi14 = rsi(closes, 14)
  const swingHigh = recentSwingHigh(candles, 30)
  const swingLow = recentSwingLow(candles, 30)
  const microHigh = recentSwingHigh(candles, 12)
  const microLow = recentSwingLow(candles, 12)

  const last = candles[candles.length - 1]
  const body = last.close - last.open
  const range = Math.max(1e-9, last.high - last.low)
  const closeLoc = (last.close - last.low) / range

  const mom5 = lastClose - candles[Math.max(0, candles.length - 6)].close
  const mom10 =
    candles[Math.max(0, candles.length - 6)].close -
    candles[Math.max(0, candles.length - 11)].close

  const vols = candles.slice(-20).map((c) => c.volume)
  const avgVol = vols.reduce((a, b) => a + b, 0) / Math.max(1, vols.length)
  const volRatio = avgVol > 0 ? last.volume / avgVol : 1

  // Weighted score −100…+100
  let score = 0
  const reasons: string[] = []

  // Trend stack (EMA)
  if (lastClose > ema9 && ema9 > ema21) {
    score += 22
    reasons.push('EMA stack up')
  } else if (lastClose < ema9 && ema9 < ema21) {
    score -= 22
    reasons.push('EMA stack down')
  } else if (lastClose > ema9) {
    score += 8
  } else if (lastClose < ema9) {
    score -= 8
  }

  // EMA9 slope
  const slope = ema9 - ema9Prev
  if (slope > atrVal * 0.05) {
    score += 12
    reasons.push('EMA9 rising')
  } else if (slope < -atrVal * 0.05) {
    score -= 12
    reasons.push('EMA9 falling')
  }

  // Momentum
  if (mom5 < 0 && mom10 < 0) {
    score -= 14
    reasons.push('2-leg down mom')
  } else if (mom5 > 0 && mom10 > 0) {
    score += 14
    reasons.push('2-leg up mom')
  } else if (mom5 < 0) score -= 6
  else if (mom5 > 0) score += 6

  // RSI regime (fade extremes, follow mid-trend)
  if (rsi14 > 70) {
    score -= 10
    reasons.push('RSI overbought')
  } else if (rsi14 < 30) {
    score += 10
    reasons.push('RSI oversold')
  } else if (rsi14 > 55) score += 6
  else if (rsi14 < 45) score -= 6

  // Candle location / rejection
  if (closeLoc < 0.25 && body < 0) {
    score -= 10
    reasons.push('close near lows')
  } else if (closeLoc > 0.75 && body > 0) {
    score += 10
    reasons.push('close near highs')
  } else if (closeLoc > 0.7 && body < 0) {
    score += 8
    reasons.push('long lower reject')
  } else if (closeLoc < 0.3 && body > 0) {
    score -= 8
    reasons.push('long upper reject')
  }

  // Volume confirms direction of body
  if (volRatio > 1.25) {
    if (body < 0) {
      score -= 8
      reasons.push('heavy down vol')
    } else if (body > 0) {
      score += 8
      reasons.push('heavy up vol')
    }
  }

  // Distance from mid of micro range — mean-revert pressure if stretched
  const mid = (microHigh + microLow) / 2
  const microRange = Math.max(atrVal, microHigh - microLow)
  const stretch = (lastClose - mid) / microRange
  if (stretch > 0.85) {
    score -= 12
    reasons.push('stretched high')
  } else if (stretch < -0.85) {
    score += 12
    reasons.push('stretched low')
  }

  // Horizon 2 is path-dependent / noisier — shrink score
  if (horizon === 2) score *= 0.65

  score = clamp(score, -100, 100)

  let bias: Bias = 'neutral'
  let confidence: NextCandleSuggestion['confidence'] = 'low'
  if (score >= 28) bias = 'bullish'
  else if (score <= -28) bias = 'bearish'

  const mag = Math.abs(score)
  if (mag >= 55) confidence = 'high'
  else if (mag >= 38) confidence = 'moderate'
  else confidence = 'low'

  // If stretched against the signal, force neutral (avoid chasing)
  if (bias === 'bullish' && stretch > 0.9) {
    bias = 'neutral'
    confidence = 'low'
    reasons.push('no chase at highs')
  }
  if (bias === 'bearish' && stretch < -0.9) {
    bias = 'neutral'
    confidence = 'low'
    reasons.push('no chase at lows')
  }

  return {
    score: round2(score),
    bias,
    confidence,
    atrVal,
    ema9,
    ema21,
    rsi14: round2(rsi14),
    swingHigh,
    swingLow,
    microHigh,
    microLow,
    structure: reasons.slice(0, 4).join(' · ') || 'balanced 5m tape',
  }
}

function projectBarFixed(args: {
  open: number
  bias: Bias
  atrVal: number
  confidence: NextCandleSuggestion['confidence']
  score: number
  horizon: 1 | 2
}): ProjectedBar {
  const { open, bias, atrVal, confidence, score, horizon } = args
  const confMul =
    confidence === 'high' ? 0.55 : confidence === 'moderate' ? 0.4 : 0.28
  const scoreMul = clamp(Math.abs(score) / 100, 0.2, 1)
  const horizonMul = horizon === 1 ? 1 : 0.75
  let move = atrVal * confMul * scoreMul * horizonMul
  const maxMove = open * MAX_MOVE_PCT
  move = Math.min(Math.max(move, Math.min(atrVal * 0.15, maxMove * 0.15)), maxMove)

  const bandPctPoints = clamp(
    ((atrVal * (confidence === 'high' ? 0.35 : 0.55)) / open) * 100,
    0.08,
    1,
  )

  let close = open
  let high = open
  let low = open
  if (bias === 'bullish') {
    close = open + move
    high = Math.min(close + move * 0.35, open + maxMove)
    low = Math.max(open - move * 0.2, open - maxMove)
  } else if (bias === 'bearish') {
    close = open - move
    low = Math.max(close - move * 0.35, open - maxMove)
    high = Math.min(open + move * 0.2, open + maxMove)
  } else {
    high = Math.min(open + move * 0.45, open + maxMove)
    low = Math.max(open - move * 0.45, open - maxMove)
    close = open + (score >= 0 ? move * 0.08 : -move * 0.08)
  }
  close = clamp(close, low, high)

  return {
    open: round2(open),
    high: round2(high),
    low: round2(low),
    close: round2(close),
    movePct: round2(((close - open) / open) * 10000) / 100, // e.g. 0.18 (%)
    bandPct: round2(bandPctPoints * 100) / 100,
  }
}

function buildCall(args: {
  scored: ScoreResult
  lastClose: number
  openPrice: number
  projected: ProjectedBar
  hitRate: number
  horizon: 1 | 2
  openTime: number
}): HorizonSuggestion {
  const { scored, lastClose, projected, hitRate, horizon, openTime } = args
  const prefix = horizon === 1 ? 'candle +1' : 'candle +2'
  const bias = scored.bias

  let expectedVsPriorClose: NextCandleSuggestion['expectedVsPriorClose'] =
    'unchanged'
  if (bias === 'bullish') expectedVsPriorClose = 'higher'
  else if (bias === 'bearish') expectedVsPriorClose = 'lower'

  const inv =
    bias === 'bullish'
      ? round2(Math.min(scored.ema9, projected.open - scored.atrVal * 0.25))
      : bias === 'bearish'
        ? round2(Math.max(scored.ema9, projected.open + scored.atrVal * 0.25))
        : round2(scored.ema9)

  const invNote =
    bias === 'bullish'
      ? `Invalidate if ${prefix} closes below ${inv}`
      : bias === 'bearish'
        ? `Invalidate if ${prefix} closes above ${inv}`
        : `Break ${inv} for direction`

  const dirWord =
    expectedVsPriorClose === 'higher'
      ? `↑ ${projected.close}`
      : expectedVsPriorClose === 'lower'
        ? `↓ ${projected.close}`
        : `↔ ${projected.close}`

  const oneLiner = `${bias} ${prefix} · expect close ${dirWord} (±${projected.bandPct}% band, move ${projected.movePct}%) · hit ${Math.round(hitRate * 100)}%`

  const targetHint =
    bias === 'bullish'
      ? `Target zone ${projected.close}–${projected.high} (≤1% of price)`
      : bias === 'bearish'
        ? `Target zone ${projected.low}–${projected.close} (≤1% of price)`
        : `Range ${projected.low}–${projected.high}`

  return {
    bias,
    lastClose: round2(lastClose),
    expectedVsPriorClose,
    targetHint,
    invalidation: inv,
    invalidationNote: invNote,
    oneLiner,
    structure: scored.structure,
    keyLevels: [
      { label: 'Swing high (30)', value: round2(scored.swingHigh) },
      { label: 'Micro high (12)', value: round2(scored.microHigh) },
      { label: 'EMA9', value: round2(scored.ema9) },
      { label: 'EMA21', value: round2(scored.ema21) },
      { label: 'Micro low (12)', value: round2(scored.microLow) },
      { label: 'Swing low (30)', value: round2(scored.swingLow) },
      { label: 'RSI14', value: scored.rsi14 },
      { label: 'ATR14', value: round2(scored.atrVal) },
    ],
    confidence: scored.confidence,
    ema9: round2(scored.ema9),
    ema21: round2(scored.ema21),
    swingHigh: round2(scored.swingHigh),
    swingLow: round2(scored.swingLow),
    analyzedBars: 0,
    atr: round2(scored.atrVal),
    recentHitRate: round2(hitRate * 100) / 100,
    score: scored.score,
    projected,
    horizon,
    bucketLabel: bucketLabel(openTime),
    openTime,
    closeTime: openTime + BAR_SEC,
  }
}

/** @deprecated prefer analyzeTwoCandles */
export function analyzeNextCandle(
  candles: Candle[],
  livePrice?: number,
): NextCandleSuggestion {
  return analyzeTwoCandles(candles, livePrice).plus1
}

export function analyzeTwoCandles(
  candles: Candle[],
  livePrice?: number,
): DualCandleSuggestions {
  const forming = candles.find((c) => c.forming) ?? candles[candles.length - 1]
  const formingOpen =
    forming?.time ?? Math.floor(Date.now() / 1000 / BAR_SEC) * BAR_SEC
  const plus1Open = formingOpen + BAR_SEC
  const plus2Open = formingOpen + BAR_SEC * 2

  const lastPx =
    livePrice ?? candles[candles.length - 1]?.close ?? 0

  const emptyProjected = (px: number): ProjectedBar => ({
    open: px,
    high: px,
    low: px,
    close: px,
    movePct: 0,
    bandPct: 1,
  })

  if (candles.length < 25) {
    const stub = (horizon: 1 | 2, openTime: number): HorizonSuggestion => ({
      bias: 'neutral',
      lastClose: lastPx,
      expectedVsPriorClose: 'unchanged',
      targetHint: 'Need ≥25 bars',
      invalidation: lastPx,
      invalidationNote: 'Insufficient history',
      oneLiner: `Neutral candle +${horizon} — not enough bars`,
      structure: 'Warming up',
      keyLevels: [],
      confidence: 'low',
      ema9: lastPx,
      ema21: lastPx,
      swingHigh: lastPx,
      swingLow: lastPx,
      analyzedBars: candles.length,
      atr: 0,
      recentHitRate: 0.5,
      score: 0,
      projected: emptyProjected(lastPx),
      horizon,
      bucketLabel: bucketLabel(openTime),
      openTime,
      closeTime: openTime + BAR_SEC,
    })
    const plus1 = stub(1, plus1Open)
    const plus2 = stub(2, plus2Open)
    return {
      plus1,
      plus2,
      primary: plus1,
      model: { atr: 0, recentHitRate: 0.5, sampleSize: 0, maxMovePct: 1 },
    }
  }

  // Work on a copy with live mark on forming close
  const series = candles.map((c) => ({ ...c }))
  const last = series[series.length - 1]
  if (livePrice != null) {
    last.close = livePrice
    last.high = Math.max(last.high, livePrice)
    last.low = Math.min(last.low, livePrice)
  }

  const { hitRate, sample } = walkForwardHitRate(series)
  const s1 = scoreHorizon(series, last.close, 1)
  const p1 = projectBarFixed({
    open: last.close,
    bias: s1.bias,
    atrVal: s1.atrVal,
    confidence: s1.confidence,
    score: s1.score,
    horizon: 1,
  })

  // +2 path: assume +1 prints near projected close, then re-score
  const path = series.map((c) => ({ ...c }))
  path.push({
    time: plus1Open,
    open: p1.open,
    high: p1.high,
    low: p1.low,
    close: p1.close,
    volume: last.volume,
    closeTime: plus1Open + BAR_SEC,
  })
  const s2 = scoreHorizon(path, p1.close, 2)
  const p2 = projectBarFixed({
    open: p1.close,
    bias: s2.bias,
    atrVal: s2.atrVal,
    confidence: s2.confidence,
    score: s2.score,
    horizon: 2,
  })

  // Blend confidence with walk-forward hit-rate (honest calibration)
  const calibrate = (
    conf: NextCandleSuggestion['confidence'],
  ): NextCandleSuggestion['confidence'] => {
    if (sample < 8) return 'low'
    if (hitRate >= 0.58 && conf === 'high') return 'high'
    if (hitRate >= 0.52 && (conf === 'high' || conf === 'moderate'))
      return 'moderate'
    if (hitRate < 0.48) return 'low'
    return conf
  }
  s1.confidence = calibrate(s1.confidence)
  s2.confidence = calibrate(s2.confidence)

  const plus1 = buildCall({
    scored: s1,
    lastClose: last.close,
    openPrice: last.close,
    projected: p1,
    hitRate,
    horizon: 1,
    openTime: plus1Open,
  })
  plus1.analyzedBars = series.length

  const plus2 = buildCall({
    scored: s2,
    lastClose: p1.close,
    openPrice: p1.close,
    projected: p2,
    hitRate: hitRate * 0.9,
    horizon: 2,
    openTime: plus2Open,
  })
  plus2.analyzedBars = series.length

  return {
    plus1,
    plus2,
    primary: plus1,
    model: {
      atr: round2(s1.atrVal),
      recentHitRate: round2(hitRate * 100) / 100,
      sampleSize: sample,
      maxMovePct: 1,
    },
  }
}
