import { alignBarOpen, BAR_SEC, barCloseTime } from './time'
import type { Candle, MarkPrint } from './types'

const MAX_GAP_FILL = BAR_SEC // never invent bars; gaps stay empty

/**
 * Align Yahoo timestamps to exact 5m opens, merge duplicates, drop junk ticks.
 * Leaves session gaps (weekend / daily halt) as missing times — no fake bars.
 */
export function normalizeFiveMinuteCandles(
  raw: Candle[],
): Candle[] {
  const byOpen = new Map<number, Candle>()

  for (const c of raw) {
    const openTime = alignBarOpen(c.time)
    // Skip sub-minute marketTime snapshots that aren't real bars
    if (
      c.volume === 0 &&
      c.high === c.low &&
      c.open === c.close &&
      c.time !== openTime &&
      c.time - openTime < 60
    ) {
      continue
    }

    const prev = byOpen.get(openTime)
    if (!prev) {
      byOpen.set(openTime, {
        time: openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        closeTime: barCloseTime(openTime),
      })
      continue
    }
    // Merge into same bucket (prefer later print for close)
    byOpen.set(openTime, {
      time: openTime,
      open: prev.open,
      high: Math.max(prev.high, c.high),
      low: Math.min(prev.low, c.low),
      close: c.close,
      volume: Math.max(prev.volume, c.volume),
      closeTime: barCloseTime(openTime),
    })
  }

  const sorted = [...byOpen.values()].sort((a, b) => a.time - b.time)

  // Mark gaps for consumers (no fill)
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].time - sorted[i - 1].time
    if (gap > MAX_GAP_FILL) {
      sorted[i] = { ...sorted[i], gapFromPrevSec: gap }
    }
  }

  return sorted
}

/**
 * Patch forming bar using the **feed/mark clock**, never wall-clock "now"
 * when the mark is delayed. Avoids painting a fake live candle at local time.
 */
export function patchFormingFromMark(
  candles: Candle[],
  mark: MarkPrint,
): Candle[] {
  if (!candles.length) return candles
  const next = candles.map((c) => ({ ...c }))
  const markBucket = alignBarOpen(mark.sourceTime)
  const last = next[next.length - 1]
  const isLive = mark.freshness === 'live'

  // Which bar does this mark belong to?
  let targetIdx = next.findIndex((c) => c.time === markBucket)
  if (targetIdx < 0) {
    // Mark bucket newer than last feed bar (can happen slightly) — only attach
    // a new bucket when mark is LIVE or markBucket is the immediate next slot.
    if (
      markBucket === last.time + BAR_SEC ||
      (isLive && markBucket > last.time && markBucket - last.time <= BAR_SEC)
    ) {
      next.push({
        time: markBucket,
        open: mark.price,
        high: mark.price,
        low: mark.price,
        close: mark.price,
        volume: 0,
        closeTime: barCloseTime(markBucket),
        forming: true,
      })
      targetIdx = next.length - 1
    } else {
      // Delayed mark still maps to last known feed bar when within that window
      // or when markBucket is behind last (stale print of prior bucket).
      targetIdx =
        markBucket < last.time
          ? next.findIndex((c) => c.time === markBucket)
          : next.length - 1
      if (targetIdx < 0) targetIdx = next.length - 1
    }
  }

  const bar = next[targetIdx]
  // Only update OHLC with mark if mark timestamp falls inside the bar window
  // [open, close) OR it's the last bar and we're still in that delayed bucket.
  const inWindow =
    mark.sourceTime >= bar.time && mark.sourceTime < bar.time + BAR_SEC
  const isLastFeedBar = targetIdx === next.length - 1

  if (inWindow || (isLastFeedBar && markBucket === bar.time)) {
    // Tradovate: open fixed for the bucket; high/low/close morph with ticks
    bar.close = mark.price
    bar.high = Math.max(bar.high, bar.open, mark.price)
    bar.low = Math.min(bar.low, bar.open, mark.price)
    bar.forming = true
  } else if (isLastFeedBar && markBucket === last.time) {
    bar.forming = true
  }

  // Clear forming on older bars
  for (let i = 0; i < next.length; i++) {
    if (i !== targetIdx) delete next[i].forming
  }

  return next
}
