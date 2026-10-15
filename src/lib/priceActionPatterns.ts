import type { Bias, Candle } from './types'

export type PatternHit = {
  name: string
  bias: Bias
  /** 0–40 conviction contribution */
  strength: number
  detail: string
}

function body(c: Candle) {
  return Math.abs(c.close - c.open)
}
function range(c: Candle) {
  return Math.max(1e-9, c.high - c.low)
}
function upperWick(c: Candle) {
  return c.high - Math.max(c.open, c.close)
}
function lowerWick(c: Candle) {
  return Math.min(c.open, c.close) - c.low
}
function isBull(c: Candle) {
  return c.close > c.open
}
function isBear(c: Candle) {
  return c.close < c.open
}

/**
 * Classic candle + multi-bar price-action patterns on recent 5m bars.
 * Returns scored hits near the live edge (last / last-2 bars).
 */
export function detectPatterns(candles: Candle[]): PatternHit[] {
  if (candles.length < 5) return []
  const hits: PatternHit[] = []
  const c0 = candles[candles.length - 1]!
  const c1 = candles[candles.length - 2]!
  const c2 = candles[candles.length - 3]!
  const atrApprox =
    candles.slice(-15).reduce((a, c) => a + range(c), 0) /
    Math.min(15, candles.length)

  // --- Single-candle price action ---
  const b0 = body(c0)
  const r0 = range(c0)
  const uw0 = upperWick(c0)
  const lw0 = lowerWick(c0)

  // Pin bar / hammer (bullish rejection)
  if (lw0 > b0 * 2 && lw0 > uw0 * 1.5 && lw0 > r0 * 0.55) {
    hits.push({
      name: 'Pin bar / hammer',
      bias: 'bullish',
      strength: 28,
      detail: 'long lower wick rejection',
    })
  }
  // Shooting star
  if (uw0 > b0 * 2 && uw0 > lw0 * 1.5 && uw0 > r0 * 0.55) {
    hits.push({
      name: 'Shooting star',
      bias: 'bearish',
      strength: 28,
      detail: 'long upper wick rejection',
    })
  }
  // Doji / indecision
  if (b0 < r0 * 0.12 && r0 > atrApprox * 0.35) {
    hits.push({
      name: 'Doji',
      bias: 'neutral',
      strength: 8,
      detail: 'indecision at edge',
    })
  }
  // Marubozu-ish impulse
  if (b0 > r0 * 0.78) {
    hits.push({
      name: isBull(c0) ? 'Bull marubozu' : 'Bear marubozu',
      bias: isBull(c0) ? 'bullish' : 'bearish',
      strength: 18,
      detail: 'full-body impulse',
    })
  }

  // --- Two-candle ---
  // Bullish engulfing
  if (
    isBear(c1) &&
    isBull(c0) &&
    c0.open <= c1.close &&
    c0.close >= c1.open &&
    body(c0) > body(c1) * 1.05
  ) {
    hits.push({
      name: 'Bullish engulfing',
      bias: 'bullish',
      strength: 32,
      detail: 'buyers swallowed prior bear',
    })
  }
  // Bearish engulfing
  if (
    isBull(c1) &&
    isBear(c0) &&
    c0.open >= c1.close &&
    c0.close <= c1.open &&
    body(c0) > body(c1) * 1.05
  ) {
    hits.push({
      name: 'Bearish engulfing',
      bias: 'bearish',
      strength: 32,
      detail: 'sellers swallowed prior bull',
    })
  }
  // Inside bar (compression)
  if (c0.high <= c1.high && c0.low >= c1.low) {
    hits.push({
      name: 'Inside bar',
      bias: 'neutral',
      strength: 10,
      detail: 'compression — wait break',
    })
  }
  // Outside bar
  if (c0.high >= c1.high && c0.low <= c1.low && body(c0) > body(c1)) {
    hits.push({
      name: isBull(c0) ? 'Bull outside bar' : 'Bear outside bar',
      bias: isBull(c0) ? 'bullish' : 'bearish',
      strength: 22,
      detail: 'range expansion',
    })
  }

  // --- Three-candle ---
  // Morning star-ish
  if (
    isBear(c2) &&
    body(c1) < body(c2) * 0.45 &&
    isBull(c0) &&
    c0.close > (c2.open + c2.close) / 2
  ) {
    hits.push({
      name: 'Morning star-ish',
      bias: 'bullish',
      strength: 26,
      detail: '3-bar bull reversal',
    })
  }
  // Evening star-ish
  if (
    isBull(c2) &&
    body(c1) < body(c2) * 0.45 &&
    isBear(c0) &&
    c0.close < (c2.open + c2.close) / 2
  ) {
    hits.push({
      name: 'Evening star-ish',
      bias: 'bearish',
      strength: 26,
      detail: '3-bar bear reversal',
    })
  }

  // --- Structure: HH/HL vs LH/LL on last 6 swing proxies ---
  const swing = candles.slice(-12)
  if (swing.length >= 8) {
    const highs = swing.map((c) => c.high)
    const lows = swing.map((c) => c.low)
    const recentH = Math.max(...highs.slice(-4))
    const priorH = Math.max(...highs.slice(0, -4))
    const recentL = Math.min(...lows.slice(-4))
    const priorL = Math.min(...lows.slice(0, -4))
    if (recentH > priorH && recentL > priorL) {
      hits.push({
        name: 'HH + HL structure',
        bias: 'bullish',
        strength: 20,
        detail: 'higher highs & higher lows',
      })
    } else if (recentH < priorH && recentL < priorL) {
      hits.push({
        name: 'LH + LL structure',
        bias: 'bearish',
        strength: 20,
        detail: 'lower highs & lower lows',
      })
    }
  }

  // --- Micro double top / bottom (last 10 bars) ---
  const win = candles.slice(-10)
  if (win.length >= 8) {
    const hiIdx = win.reduce(
      (bi, c, i, a) => (c.high > a[bi]!.high ? i : bi),
      0,
    )
    const loIdx = win.reduce(
      (bi, c, i, a) => (c.low < a[bi]!.low ? i : bi),
      0,
    )
    const peak = win[hiIdx]!
    const trough = win[loIdx]!
    // Double top: another high within 0.15 ATR of peak, then close fading
    const nearPeak = win.filter(
      (c, i) =>
        i !== hiIdx && Math.abs(c.high - peak.high) < atrApprox * 0.2,
    )
    if (nearPeak.length && hiIdx < win.length - 2 && isBear(c0)) {
      hits.push({
        name: 'Micro double top',
        bias: 'bearish',
        strength: 24,
        detail: 'failed retest of highs',
      })
    }
    const nearTrough = win.filter(
      (c, i) =>
        i !== loIdx && Math.abs(c.low - trough.low) < atrApprox * 0.2,
    )
    if (nearTrough.length && loIdx < win.length - 2 && isBull(c0)) {
      hits.push({
        name: 'Micro double bottom',
        bias: 'bullish',
        strength: 24,
        detail: 'failed retest of lows',
      })
    }
  }

  // --- Momentum bursts (consecutive bodies) ---
  let bullRun = 0
  let bearRun = 0
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    const c = candles[i]!
    if (isBull(c) && body(c) > range(c) * 0.4) bullRun++
    else break
  }
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    const c = candles[i]!
    if (isBear(c) && body(c) > range(c) * 0.4) bearRun++
    else break
  }
  if (bullRun >= 3) {
    hits.push({
      name: `${bullRun}-bar bull run`,
      bias: 'bullish',
      strength: 14,
      detail: 'consecutive bullish bodies',
    })
  }
  if (bearRun >= 3) {
    hits.push({
      name: `${bearRun}-bar bear run`,
      bias: 'bearish',
      strength: 14,
      detail: 'consecutive bearish bodies',
    })
  }

  return hits.sort((a, b) => b.strength - a.strength)
}

export function scorePatterns(hits: PatternHit[]): {
  score: number
  bias: Bias
  summary: string
  top: PatternHit[]
} {
  let score = 0
  for (const h of hits) {
    if (h.bias === 'bullish') score += h.strength
    else if (h.bias === 'bearish') score -= h.strength
  }
  // Soft-cap
  score = Math.max(-45, Math.min(45, score))
  const bias: Bias =
    score >= 16 ? 'bullish' : score <= -16 ? 'bearish' : 'neutral'
  const top = hits.filter((h) => h.bias !== 'neutral').slice(0, 3)
  const summary =
    top.map((h) => h.name).join(' + ') ||
    hits[0]?.name ||
    'no clear pattern'
  return { score, bias, summary, top }
}
