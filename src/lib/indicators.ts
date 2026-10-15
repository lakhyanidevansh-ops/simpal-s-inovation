import {
  ADX,
  ATR,
  BollingerBands,
  EMA,
  MACD,
  RSI,
  Stochastic,
} from 'technicalindicators'
import { mean, sampleStandardDeviation, zScore } from 'simple-statistics'
import type { Candle } from './types'

export type IndicatorBundle = {
  ema9: number
  ema21: number
  ema50: number
  atr14: number
  rsi14: number
  macd: number
  macdSignal: number
  macdHist: number
  bbUpper: number
  bbMiddle: number
  bbLower: number
  bbPctB: number
  stochK: number
  stochD: number
  adx: number
  plusDI: number
  minusDI: number
  /** Z-score of last return vs recent returns */
  returnZ: number
  /** Avg true range as % of price */
  atrPct: number
}

function last<T>(arr: T[], fallback: T): T {
  return arr.length ? arr[arr.length - 1]! : fallback
}

/**
 * Library-backed indicator pack (technicalindicators + simple-statistics).
 * Keeps suggestion sizing near price — consumers still cap move %.
 */
export function computeIndicators(
  candles: Candle[],
  lastClose: number,
): IndicatorBundle {
  const closes = candles.map((c) => c.close)
  closes[closes.length - 1] = lastClose
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  highs[highs.length - 1] = Math.max(highs[highs.length - 1]!, lastClose)
  lows[lows.length - 1] = Math.min(lows[lows.length - 1]!, lastClose)

  const ema9 = last(EMA.calculate({ period: 9, values: closes }), lastClose)
  const ema21 = last(EMA.calculate({ period: 21, values: closes }), lastClose)
  const ema50 = last(EMA.calculate({ period: 50, values: closes }), lastClose)

  const atr14 = last(
    ATR.calculate({ period: 14, high: highs, low: lows, close: closes }),
    Math.max(1, lastClose * 0.0005),
  )

  const rsi14 = last(RSI.calculate({ period: 14, values: closes }), 50)

  const macdSeries = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const macdLast = last(macdSeries, {
    MACD: 0,
    signal: 0,
    histogram: 0,
  })

  const bb = BollingerBands.calculate({
    period: 20,
    values: closes,
    stdDev: 2,
  })
  const bbLast = last(bb, {
    upper: lastClose,
    middle: lastClose,
    lower: lastClose,
    pb: 0.5,
  })
  const bbPctB =
    typeof (bbLast as { pb?: number }).pb === 'number'
      ? (bbLast as { pb: number }).pb
      : (lastClose - bbLast.lower) /
        Math.max(1e-9, bbLast.upper - bbLast.lower)

  const stoch = Stochastic.calculate({
    period: 14,
    signalPeriod: 3,
    high: highs,
    low: lows,
    close: closes,
  })
  const stochLast = last(stoch, { k: 50, d: 50 })

  const adxSeries = ADX.calculate({
    period: 14,
    high: highs,
    low: lows,
    close: closes,
  })
  const adxLast = last(adxSeries, { adx: 15, pdi: 20, mdi: 20 })

  // Return z-score (last 1-bar return vs prior 40)
  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) {
    rets.push((closes[i]! - closes[i - 1]!) / closes[i - 1]!)
  }
  const window = rets.slice(-40)
  let returnZ = 0
  if (window.length >= 8) {
    const latest = window[window.length - 1]!
    const hist = window.slice(0, -1)
    const mu = mean(hist)
    const sd = sampleStandardDeviation(hist) || 1e-9
    returnZ = zScore(latest, mu, sd)
  }

  return {
    ema9,
    ema21,
    ema50,
    atr14,
    rsi14,
    macd: macdLast.MACD ?? 0,
    macdSignal: macdLast.signal ?? 0,
    macdHist: macdLast.histogram ?? 0,
    bbUpper: bbLast.upper,
    bbMiddle: bbLast.middle,
    bbLower: bbLast.lower,
    bbPctB,
    stochK: stochLast.k ?? 50,
    stochD: stochLast.d ?? 50,
    adx: adxLast.adx ?? 15,
    plusDI: adxLast.pdi ?? 20,
    minusDI: adxLast.mdi ?? 20,
    returnZ,
    atrPct: (atr14 / lastClose) * 100,
  }
}
