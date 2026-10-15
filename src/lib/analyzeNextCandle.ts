import { BAR_SEC, EXCHANGE_TZ, formatClock } from './time'
import {
  loadLearner,
  strategyLabel,
  voteHitRate,
  type StrategyId,
} from './liveLearner'
import { runAllStrategies } from './strategies'
import type {
  Bias,
  Candle,
  DualCandleSuggestions,
  HorizonSuggestion,
  NextCandleSuggestion,
  ProjectedBar,
  StrategySnapshot,
} from './types'

/**
 * Near-price only: 5m suggestion body capped at ~0.12% of price or 0.4×ATR.
 * User complaint: prior targets were "too far".
 */
const MAX_MOVE_PCT = 0.0012
const ATR_BODY_FRAC = 0.4
const ATR_WICK_FRAC = 0.18

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

function projectNear(args: {
  open: number
  bias: Bias
  atrVal: number
  score: number
  confidence: NextCandleSuggestion['confidence']
  horizon: 1 | 2
}): ProjectedBar {
  const { open, bias, atrVal, score, confidence, horizon } = args
  const confMul =
    confidence === 'high' ? 1 : confidence === 'moderate' ? 0.75 : 0.5
  const scoreMul = clamp(Math.abs(score) / 80, 0.25, 1)
  const horizonMul = horizon === 1 ? 1 : 0.7
  const maxByPct = open * MAX_MOVE_PCT
  const maxByAtr = atrVal * ATR_BODY_FRAC
  let move = Math.min(maxByPct, maxByAtr) * confMul * scoreMul * horizonMul
  move = Math.max(move, Math.min(atrVal * 0.08, maxByPct * 0.5))

  const bandPts = clamp(
    ((atrVal * (confidence === 'high' ? 0.2 : 0.32)) / open) * 100,
    0.03,
    0.15,
  )

  const wick = Math.min(atrVal * ATR_WICK_FRAC, open * MAX_MOVE_PCT * 0.6)
  let close = open
  let high = open
  let low = open
  if (bias === 'bullish') {
    close = open + move
    high = close + wick * 0.5
    low = open - wick * 0.35
  } else if (bias === 'bearish') {
    close = open - move
    low = close - wick * 0.5
    high = open + wick * 0.35
  } else {
    high = open + move * 0.55
    low = open - move * 0.55
    close = open + (score >= 0 ? move * 0.1 : -move * 0.1)
  }

  const hard = open * MAX_MOVE_PCT * 1.15
  high = Math.min(high, open + hard)
  low = Math.max(low, open - hard)
  close = clamp(close, low, high)

  return {
    open: round2(open),
    high: round2(high),
    low: round2(low),
    close: round2(close),
    movePct: round2(((close - open) / open) * 10000) / 100,
    bandPct: round2(bandPts * 100) / 100,
  }
}

function voteStrategies(
  signals: ReturnType<typeof runAllStrategies>['signals'],
  weights: Record<StrategyId, number>,
  horizon: 1 | 2,
): { bias: Bias; score: number; confidence: NextCandleSuggestion['confidence']; structure: string; snapshots: StrategySnapshot[] } {
  let weighted = 0
  let wSum = 0
  const snapshots: StrategySnapshot[] = []

  for (const s of signals) {
    const w = weights[s.id] ?? 1
    const adj = s.score * w * (horizon === 2 ? 0.7 : 1)
    weighted += adj
    wSum += w
    snapshots.push({
      id: s.id,
      label: strategyLabel(s.id),
      bias: s.bias,
      score: round2(s.score),
      weight: round2(w),
      reason: s.reason,
      active: false,
    })
  }

  const score = wSum ? weighted / (wSum / signals.length) : 0
  let bias: Bias = 'neutral'
  if (score >= 16) bias = 'bullish'
  else if (score <= -16) bias = 'bearish'

  const mag = Math.abs(score)
  const confidence: NextCandleSuggestion['confidence'] =
    mag >= 36 ? 'high' : mag >= 22 ? 'moderate' : 'low'

  // Mark strategies that agree with the vote as active
  for (const snap of snapshots) {
    snap.active = bias !== 'neutral' && snap.bias === bias
  }

  const top = [...snapshots].sort(
    (a, b) => Math.abs(b.score) * b.weight - Math.abs(a.score) * a.weight,
  )[0]
  const structure = top
    ? `${top.label}: ${top.reason}`
    : 'multi-strategy balance'

  return { bias, score: round2(score), confidence, structure, snapshots }
}

function buildCall(args: {
  bias: Bias
  score: number
  confidence: NextCandleSuggestion['confidence']
  structure: string
  lastClose: number
  projected: ProjectedBar
  atrVal: number
  ema9: number
  ema21: number
  microHigh: number
  microLow: number
  hitRate: number
  strategies: StrategySnapshot[]
  horizon: 1 | 2
  openTime: number
  analyzedBars: number
}): HorizonSuggestion {
  const {
    bias,
    score,
    confidence,
    structure,
    lastClose,
    projected,
    atrVal,
    ema9,
    ema21,
    microHigh,
    microLow,
    hitRate,
    strategies,
    horizon,
    openTime,
    analyzedBars,
  } = args

  const expectedVsPriorClose: NextCandleSuggestion['expectedVsPriorClose'] =
    bias === 'bullish' ? 'higher' : bias === 'bearish' ? 'lower' : 'unchanged'

  // Invalidation stays tight — ~0.25 ATR from open, not distant swing levels
  const invDist = Math.max(atrVal * 0.25, lastClose * 0.0004)
  const inv =
    bias === 'bullish'
      ? round2(projected.open - invDist)
      : bias === 'bearish'
        ? round2(projected.open + invDist)
        : round2(ema9)

  const prefix = horizon === 1 ? 'candle +1' : 'candle +2'
  const oneLiner = `${bias} ${prefix} · near ${projected.close} (${projected.movePct >= 0 ? '+' : ''}${projected.movePct.toFixed(3)}%) · live learn ${Math.round(hitRate * 100)}%`

  return {
    bias,
    lastClose: round2(lastClose),
    expectedVsPriorClose,
    targetHint: `Near-price zone ${projected.low}–${projected.high} (≤0.12%)`,
    invalidation: inv,
    invalidationNote:
      bias === 'bullish'
        ? `Invalidate below ${inv}`
        : bias === 'bearish'
          ? `Invalidate above ${inv}`
          : `Break ${inv} for direction`,
    oneLiner,
    structure,
    keyLevels: [
      { label: 'Micro high', value: round2(microHigh) },
      { label: 'EMA9', value: round2(ema9) },
      { label: 'Exp close', value: projected.close },
      { label: 'EMA21', value: round2(ema21) },
      { label: 'Micro low', value: round2(microLow) },
      { label: 'ATR14', value: round2(atrVal) },
    ],
    confidence,
    ema9: round2(ema9),
    ema21: round2(ema21),
    swingHigh: round2(microHigh),
    swingLow: round2(microLow),
    analyzedBars,
    atr: round2(atrVal),
    recentHitRate: round2(hitRate * 100) / 100,
    score,
    projected,
    strategies,
    activeStrategy:
      strategies.find((s) => s.active)?.label ?? 'Multi-strategy vote',
    horizon,
    bucketLabel: bucketLabel(openTime),
    openTime,
    closeTime: openTime + BAR_SEC,
  }
}

/** @deprecated */
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
  const lastPx = livePrice ?? candles[candles.length - 1]?.close ?? 0

  const empty = (horizon: 1 | 2, openTime: number): HorizonSuggestion => ({
    bias: 'neutral',
    lastClose: lastPx,
    expectedVsPriorClose: 'unchanged',
    targetHint: 'Need ≥30 bars',
    invalidation: lastPx,
    invalidationNote: 'Warming up',
    oneLiner: `Neutral +${horizon} — learning…`,
    structure: 'insufficient history',
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
    projected: {
      open: lastPx,
      high: lastPx,
      low: lastPx,
      close: lastPx,
      movePct: 0,
      bandPct: 0.1,
    },
    strategies: [],
    activeStrategy: '—',
    horizon,
    bucketLabel: bucketLabel(openTime),
    openTime,
    closeTime: openTime + BAR_SEC,
  })

  if (candles.length < 30) {
    const plus1 = empty(1, plus1Open)
    const plus2 = empty(2, plus2Open)
    return {
      plus1,
      plus2,
      primary: plus1,
      model: {
        atr: 0,
        recentHitRate: 0.5,
        sampleSize: 0,
        maxMovePct: MAX_MOVE_PCT * 100,
        learningSample: 0,
        strategies: [],
      },
    }
  }

  const series = candles.map((c) => ({ ...c }))
  const last = series[series.length - 1]
  if (livePrice != null) {
    last.close = livePrice
    last.high = Math.max(last.high, livePrice)
    last.low = Math.min(last.low, livePrice)
  }

  const learner = loadLearner()
  const weights = {
    trend: learner.strategies.trend.weight,
    meanRevert: learner.strategies.meanRevert.weight,
    breakout: learner.strategies.breakout.weight,
    momentum: learner.strategies.momentum.weight,
    macdFlow: learner.strategies.macdFlow.weight,
  }
  const hitRate = voteHitRate(learner)

  const { tape, signals } = runAllStrategies(series, last.close)
  const v1 = voteStrategies(signals, weights, 1)
  // Calibrate confidence with live learner
  if (learner.sample >= 8 && hitRate < 0.48) v1.confidence = 'low'
  else if (learner.sample >= 12 && hitRate >= 0.58 && v1.confidence === 'moderate')
    v1.confidence = 'high'

  const p1 = projectNear({
    open: last.close,
    bias: v1.bias,
    atrVal: tape.atr14,
    score: v1.score,
    confidence: v1.confidence,
    horizon: 1,
  })

  // Path +2 from near projected close
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
  const { tape: tape2, signals: sig2 } = runAllStrategies(path, p1.close)
  const v2 = voteStrategies(sig2, weights, 2)
  if (learner.sample >= 8 && hitRate < 0.5) v2.confidence = 'low'

  const p2 = projectNear({
    open: p1.close,
    bias: v2.bias,
    atrVal: tape2.atr14,
    score: v2.score,
    confidence: v2.confidence,
    horizon: 2,
  })

  const plus1 = buildCall({
    bias: v1.bias,
    score: v1.score,
    confidence: v1.confidence,
    structure: v1.structure,
    lastClose: last.close,
    projected: p1,
    atrVal: tape.atr14,
    ema9: tape.ema9,
    ema21: tape.ema21,
    microHigh: tape.microHigh,
    microLow: tape.microLow,
    hitRate,
    strategies: v1.snapshots,
    horizon: 1,
    openTime: plus1Open,
    analyzedBars: series.length,
  })

  const plus2 = buildCall({
    bias: v2.bias,
    score: v2.score,
    confidence: v2.confidence,
    structure: v2.structure,
    lastClose: p1.close,
    projected: p2,
    atrVal: tape2.atr14,
    ema9: tape2.ema9,
    ema21: tape2.ema21,
    microHigh: tape2.microHigh,
    microLow: tape2.microLow,
    hitRate: hitRate * 0.92,
    strategies: v2.snapshots,
    horizon: 2,
    openTime: plus2Open,
    analyzedBars: series.length,
  })

  return {
    plus1,
    plus2,
    primary: plus1,
    model: {
      atr: round2(tape.atr14),
      recentHitRate: round2(hitRate * 100) / 100,
      sampleSize: learner.voteHits + learner.voteMisses,
      maxMovePct: MAX_MOVE_PCT * 100,
      learningSample: learner.sample,
      strategies: v1.snapshots,
    },
  }
}

/** Expose strategy biases for the live learner after a bar closes. */
export function strategyBiasesAt(
  candles: Candle[],
  lastClose: number,
): Record<StrategyId, Bias> {
  const { signals } = runAllStrategies(candles, lastClose)
  return {
    trend: signals.find((s) => s.id === 'trend')?.bias ?? 'neutral',
    meanRevert: signals.find((s) => s.id === 'meanRevert')?.bias ?? 'neutral',
    breakout: signals.find((s) => s.id === 'breakout')?.bias ?? 'neutral',
    momentum: signals.find((s) => s.id === 'momentum')?.bias ?? 'neutral',
    macdFlow: signals.find((s) => s.id === 'macdFlow')?.bias ?? 'neutral',
  }
}
