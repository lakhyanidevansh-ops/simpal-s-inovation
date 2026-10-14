import { BAR_SEC, EXCHANGE_TZ, formatClock } from './time'
import type {
  Bias,
  Candle,
  DualCandleSuggestions,
  HorizonSuggestion,
  NextCandleSuggestion,
} from './types'

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

function bucketLabel(openSec: number): string {
  const close = openSec + BAR_SEC
  return `${formatClock(openSec, EXCHANGE_TZ)}–${formatClock(close, EXCHANGE_TZ)} CT`
}

function buildCall(args: {
  bias: Bias
  lastClose: number
  expectedVsPriorClose: NextCandleSuggestion['expectedVsPriorClose']
  targetHint: string
  invalidation: number
  invalidationNote: string
  structure: string
  confidence: NextCandleSuggestion['confidence']
  ema9: number
  ema21: number
  swingHigh: number
  swingLow: number
  microHigh: number
  microLow: number
  analyzedBars: number
  horizon: 1 | 2
  openTime: number
  prefix: string
}): HorizonSuggestion {
  const dirWord =
    args.expectedVsPriorClose === 'higher'
      ? `higher than ${round2(args.lastClose)}`
      : args.expectedVsPriorClose === 'lower'
        ? `lower than ${round2(args.lastClose)}`
        : `near ${round2(args.lastClose)}`

  const invSym =
    args.bias === 'bearish' ? '>' : args.bias === 'bullish' ? '<' : 'through'

  const oneLiner = `${args.bias[0].toUpperCase()}${args.bias.slice(1)} ${args.prefix} — expect close ${dirWord}; invalidate ${invSym} ${args.invalidation}`

  return {
    bias: args.bias,
    lastClose: round2(args.lastClose),
    expectedVsPriorClose: args.expectedVsPriorClose,
    targetHint: args.targetHint,
    invalidation: args.invalidation,
    invalidationNote: args.invalidationNote,
    oneLiner,
    structure: args.structure,
    keyLevels: [
      { label: 'Swing high (30)', value: round2(args.swingHigh) },
      { label: 'Micro high (12)', value: round2(args.microHigh) },
      { label: 'EMA9', value: round2(args.ema9) },
      { label: 'EMA21', value: round2(args.ema21) },
      { label: 'Micro low (12)', value: round2(args.microLow) },
      { label: 'Swing low (30)', value: round2(args.swingLow) },
    ],
    confidence: args.confidence,
    ema9: round2(args.ema9),
    ema21: round2(args.ema21),
    swingHigh: round2(args.swingHigh),
    swingLow: round2(args.swingLow),
    analyzedBars: args.analyzedBars,
    horizon: args.horizon,
    bucketLabel: bucketLabel(args.openTime),
    openTime: args.openTime,
    closeTime: args.openTime + BAR_SEC,
  }
}

/** @deprecated prefer analyzeTwoCandles — kept for single-horizon callers */
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
  const formingOpen = forming?.time ?? Math.floor(Date.now() / 1000 / BAR_SEC) * BAR_SEC
  const plus1Open = formingOpen + BAR_SEC
  const plus2Open = formingOpen + BAR_SEC * 2

  if (candles.length < 25) {
    const last = livePrice ?? candles[candles.length - 1]?.close ?? 0
    const stub = (horizon: 1 | 2, openTime: number): HorizonSuggestion =>
      buildCall({
        bias: 'neutral',
        lastClose: last,
        expectedVsPriorClose: 'unchanged',
        targetHint: 'Insufficient bars',
        invalidation: last,
        invalidationNote: 'Need more history',
        structure: 'Not enough bars for a 5m call',
        confidence: 'low',
        ema9: last,
        ema21: last,
        swingHigh: last,
        swingLow: last,
        microHigh: last,
        microLow: last,
        analyzedBars: candles.length,
        horizon,
        openTime,
        prefix: horizon === 1 ? 'candle +1' : 'candle +2',
      })
    const plus1 = stub(1, plus1Open)
    const plus2 = stub(2, plus2Open)
    return { plus1, plus2, primary: plus1 }
  }

  const closes = candles.map((c) => c.close)
  if (livePrice != null && closes.length) closes[closes.length - 1] = livePrice
  const e9 = ema(closes, 9)
  const e21 = ema(closes, 21)
  const ema9 = e9[e9.length - 1]
  const ema21 = e21[e21.length - 1]
  const last = { ...candles[candles.length - 1] }
  if (livePrice != null) {
    last.close = livePrice
    last.high = Math.max(last.high, livePrice)
    last.low = Math.min(last.low, livePrice)
  }
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

  let bias1: Bias = 'neutral'
  let dir1: NextCandleSuggestion['expectedVsPriorClose'] = 'unchanged'
  let inv1 = round2(ema9)
  let invNote1 = `Candle +1 close back through EMA9 (${round2(ema9)})`
  let target1 = 'Chop around last close'
  let conf1: NextCandleSuggestion['confidence'] = 'low'
  let struct1 =
    'Mixed 5m structure — no clear continuation edge into candle +1'

  if (
    belowEma9 &&
    belowEma21 &&
    (failedBounce || consecutiveReds >= 2 || momShort < 0)
  ) {
    bias1 = 'bearish'
    dir1 = 'lower'
    inv1 = round2(Math.max(ema9, lastClose + Math.abs(momShort) * 0.15))
    if (inv1 <= lastClose) inv1 = round2(ema9)
    invNote1 = `Candle +1 close above ${inv1}`
    target1 = `Toward ${round2(microLow)} / swing low ${round2(swingLow)}`
    conf1 = failedBounce || consecutiveReds >= 3 ? 'moderate' : 'low'
    struct1 = failedBounce
      ? 'Failed bounce — candle +1 favors continuation lower'
      : 'Below EMA9/21 — candle +1 favors downside follow-through'
  } else if (
    aboveEma9 &&
    aboveEma21 &&
    (reliefBounce || consecutiveGreens >= 2 || momShort > 0)
  ) {
    bias1 = 'bullish'
    dir1 = 'higher'
    inv1 = round2(Math.min(ema9, lastClose - Math.abs(momShort) * 0.15))
    if (inv1 >= lastClose) inv1 = round2(ema9)
    invNote1 = `Candle +1 close below ${inv1}`
    target1 = `Toward ${round2(microHigh)} / swing high ${round2(swingHigh)}`
    conf1 = reliefBounce || consecutiveGreens >= 3 ? 'moderate' : 'low'
    struct1 = reliefBounce
      ? 'Relief reclaim — candle +1 favors upside follow-through'
      : 'Above EMA9/21 — candle +1 favors continuation higher'
  }

  const plus1 = buildCall({
    bias: bias1,
    lastClose,
    expectedVsPriorClose: dir1,
    targetHint: target1,
    invalidation: inv1,
    invalidationNote: invNote1,
    structure: struct1,
    confidence: conf1,
    ema9,
    ema21,
    swingHigh,
    swingLow,
    microHigh,
    microLow,
    analyzedBars: candles.length,
    horizon: 1,
    openTime: plus1Open,
    prefix: 'candle +1',
  })

  // Candle +2: path-dependent on +1 — continuation if trend, else fade/chop
  let bias2: Bias = bias1
  let dir2: NextCandleSuggestion['expectedVsPriorClose'] = dir1
  let conf2: NextCandleSuggestion['confidence'] =
    conf1 === 'moderate' ? 'low' : 'low'
  let ref2 = lastClose
  let inv2 = inv1
  let target2 = target1
  let struct2 = 'Candle +2 inherits +1 path with lower confidence'

  if (bias1 === 'bearish') {
    // Project mild continuation into +1 then +2
    ref2 = round2(lastClose - Math.max(4, Math.abs(momShort) * 0.25))
    inv2 = round2(Math.max(inv1, (lastClose + inv1) / 2))
    target2 = `Extension toward ${round2(swingLow)} if +1 holds bearish`
    struct2 =
      'If candle +1 prints lower, +2 looks for continuation / liquidity toward swing low'
    dir2 = 'lower'
    // Stretch: after two down legs, allow mean-revert lean at low confidence
    if (Math.abs(momShort) > (microHigh - microLow) * 0.85) {
      bias2 = 'neutral'
      dir2 = 'unchanged'
      conf2 = 'low'
      ref2 = ref2
      inv2 = round2(microLow)
      target2 = `Watch bounce vs ${round2(microLow)} after stretch`
      struct2 =
        'Stretch into lows — candle +2 less reliable; favor reaction vs micro/swing low'
    }
  } else if (bias1 === 'bullish') {
    ref2 = round2(lastClose + Math.max(4, Math.abs(momShort) * 0.25))
    inv2 = round2(Math.min(inv1, (lastClose + inv1) / 2))
    target2 = `Extension toward ${round2(swingHigh)} if +1 holds bullish`
    struct2 =
      'If candle +1 prints higher, +2 looks for continuation toward swing high'
    dir2 = 'higher'
    if (Math.abs(momShort) > (microHigh - microLow) * 0.85) {
      bias2 = 'neutral'
      dir2 = 'unchanged'
      conf2 = 'low'
      inv2 = round2(microHigh)
      target2 = `Watch fade vs ${round2(microHigh)} after stretch`
      struct2 =
        'Stretch into highs — candle +2 less reliable; favor reaction vs micro/swing high'
    }
  } else {
    bias2 = 'neutral'
    dir2 = 'unchanged'
    ref2 = lastClose
    inv2 = round2(ema9)
    target2 = `Range ${round2(microLow)}–${round2(microHigh)} into +2`
    struct2 = 'Chop — candle +2 waits on EMA reclaim/reject after +1'
    conf2 = 'low'
  }

  const invNote2 =
    bias2 === 'bearish'
      ? `Candle +2 close above ${inv2}`
      : bias2 === 'bullish'
        ? `Candle +2 close below ${inv2}`
        : `Candle +2 break through ${inv2} for direction`

  const plus2 = buildCall({
    bias: bias2,
    lastClose: ref2,
    expectedVsPriorClose: dir2,
    targetHint: target2,
    invalidation: inv2,
    invalidationNote: invNote2,
    structure: struct2,
    confidence: conf2,
    ema9,
    ema21,
    swingHigh,
    swingLow,
    microHigh,
    microLow,
    analyzedBars: candles.length,
    horizon: 2,
    openTime: plus2Open,
    prefix: 'candle +2',
  })

  return { plus1, plus2, primary: plus1 }
}
