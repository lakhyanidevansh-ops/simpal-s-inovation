import type { Bias, Candle, NextCandleSuggestion } from './types'

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

function recentSwingHigh(candles: Candle[], lookback: number): number {
  const slice = candles.slice(-lookback)
  return Math.max(...slice.map((c) => c.high))
}

function recentSwingLow(candles: Candle[], lookback: number): number {
  const slice = candles.slice(-lookback)
  return Math.min(...slice.map((c) => c.low))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function analyzeNextCandle(candles: Candle[]): NextCandleSuggestion {
  if (candles.length < 25) {
    const last = candles[candles.length - 1]?.close ?? 0
    return {
      bias: 'neutral',
      lastClose: last,
      expectedVsPriorClose: 'unchanged',
      targetHint: 'Insufficient bars',
      invalidation: last,
      invalidationNote: 'Need more history',
      oneLiner: 'Neutral — waiting for enough 5m history',
      structure: 'Not enough bars for a 5m call',
      keyLevels: [],
      confidence: 'low',
      ema9: last,
      ema21: last,
      swingHigh: last,
      swingLow: last,
      analyzedBars: candles.length,
    }
  }

  const closes = candles.map((c) => c.close)
  const e9 = ema(closes, 9)
  const e21 = ema(closes, 21)
  const ema9 = e9[e9.length - 1]
  const ema21 = e21[e21.length - 1]
  const last = candles[candles.length - 1]
  const prior = candles[candles.length - 2]
  const lastClose = last.close

  const swingHigh = recentSwingHigh(candles, 30)
  const swingLow = recentSwingLow(candles, 30)
  const microHigh = recentSwingHigh(candles, 12)
  const microLow = recentSwingLow(candles, 12)

  const last6 = candles.slice(-6)
  const redStreak = [...last6].reverse().findIndex((c) => c.close >= c.open)
  const greenStreak = [...last6].reverse().findIndex((c) => c.close <= c.open)
  const consecutiveReds = redStreak === -1 ? last6.length : redStreak
  const consecutiveGreens = greenStreak === -1 ? last6.length : greenStreak

  const momShort = lastClose - candles[candles.length - 6].close
  const momPrior =
    candles[candles.length - 6].close - candles[candles.length - 11].close

  const belowEma9 = lastClose < ema9
  const belowEma21 = lastClose < ema21
  const aboveEma9 = lastClose > ema9
  const aboveEma21 = lastClose > ema21
  const failedBounce =
    belowEma9 &&
    momPrior > 0 &&
    momShort < 0 &&
    microHigh > ema9 &&
    lastClose < microHigh - (microHigh - microLow) * 0.35

  const reliefBounce =
    aboveEma9 &&
    momPrior < 0 &&
    momShort > 0 &&
    microLow < ema9 &&
    lastClose > microLow + (microHigh - microLow) * 0.35

  let bias: Bias = 'neutral'
  let expectedVsPriorClose: NextCandleSuggestion['expectedVsPriorClose'] =
    'unchanged'
  let invalidation = round2(ema9)
  let invalidationNote = `Close back through EMA9 (${round2(ema9)})`
  let targetHint = 'Chop around last close'
  let confidence: NextCandleSuggestion['confidence'] = 'low'
  let structure =
    'Mixed 5m structure — no clear continuation edge into the next bar'

  if (
    belowEma9 &&
    belowEma21 &&
    (failedBounce || consecutiveReds >= 2 || momShort < 0)
  ) {
    bias = 'bearish'
    expectedVsPriorClose = 'lower'
    invalidation = round2(Math.max(ema9, prior.high, last.high) + 0.25)
    // Prefer a tight micro invalidation near EMA9 / stall zone
    invalidation = round2(Math.max(ema9, lastClose + Math.abs(momShort) * 0.15))
    if (invalidation <= lastClose) invalidation = round2(ema9)
    invalidationNote = `Next 5m close above ${invalidation}`
    targetHint = `Toward ${round2(microLow)} / swing low ${round2(swingLow)}`
    confidence = failedBounce || consecutiveReds >= 3 ? 'moderate' : 'low'
    structure = failedBounce
      ? 'Downtrend day / failed relief bounce — sellers still in control on 5m'
      : 'Price below EMA9/21 with downside follow-through on recent 5m bars'
  } else if (
    aboveEma9 &&
    aboveEma21 &&
    (reliefBounce || consecutiveGreens >= 2 || momShort > 0)
  ) {
    bias = 'bullish'
    expectedVsPriorClose = 'higher'
    invalidation = round2(Math.min(ema9, lastClose - Math.abs(momShort) * 0.15))
    if (invalidation >= lastClose) invalidation = round2(ema9)
    invalidationNote = `Next 5m close below ${invalidation}`
    targetHint = `Toward ${round2(microHigh)} / swing high ${round2(swingHigh)}`
    confidence = reliefBounce || consecutiveGreens >= 3 ? 'moderate' : 'low'
    structure = reliefBounce
      ? 'Short-covering bounce reclaiming EMA9 — bulls have micro control'
      : 'Price above EMA9/21 with upside follow-through on recent 5m bars'
  } else {
    bias = 'neutral'
    expectedVsPriorClose = 'unchanged'
    invalidation = round2(ema9)
    invalidationNote = `Break/close beyond EMA9 (${round2(ema9)}) for direction`
    targetHint = `Range ${round2(microLow)}–${round2(microHigh)}`
    confidence = 'low'
    structure = '5m compression / mixed signals — wait for EMA reclaim or reject'
  }

  const dirWord =
    expectedVsPriorClose === 'higher'
      ? `higher than ${round2(lastClose)}`
      : expectedVsPriorClose === 'lower'
        ? `lower than ${round2(lastClose)}`
        : `near ${round2(lastClose)}`

  const oneLiner = `${bias[0].toUpperCase()}${bias.slice(1)} next 5m — expect close ${dirWord}; invalidate ${
    bias === 'bearish'
      ? `> ${invalidation}`
      : bias === 'bullish'
        ? `< ${invalidation}`
        : `through ${invalidation}`
  }`

  return {
    bias,
    lastClose: round2(lastClose),
    expectedVsPriorClose,
    targetHint,
    invalidation,
    invalidationNote,
    oneLiner,
    structure,
    keyLevels: [
      { label: 'Swing high (30)', value: round2(swingHigh) },
      { label: 'Micro high (12)', value: round2(microHigh) },
      { label: 'EMA9', value: round2(ema9) },
      { label: 'EMA21', value: round2(ema21) },
      { label: 'Micro low (12)', value: round2(microLow) },
      { label: 'Swing low (30)', value: round2(swingLow) },
    ],
    confidence,
    ema9: round2(ema9),
    ema21: round2(ema21),
    swingHigh: round2(swingHigh),
    swingLow: round2(swingLow),
    analyzedBars: candles.length,
  }
}
