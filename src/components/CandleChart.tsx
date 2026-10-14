import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type HistogramData,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BAR_SEC,
  DISPLAY_ET,
  EXCHANGE_TZ,
  formatClock,
  formatInZone,
} from '../lib/time'
import type {
  Candle,
  DualCandleSuggestions,
  MarkPrint,
  NextCandleSuggestion,
} from '../lib/types'

const COLORS = {
  bg: '#0b0d10',
  text: '#9aa3b2',
  grid: '#1c222b',
  border: '#2a313c',
  cross: '#6b7789',
  up: '#2ecc71',
  down: '#e74c3c',
  upBorder: '#27ae60',
  downBorder: '#c0392b',
  volUp: 'rgba(46, 204, 113, 0.55)',
  volDown: 'rgba(231, 76, 60, 0.55)',
  invalid: '#f0a500',
  ema: '#3d8bfd',
  nextBody: 'rgba(61, 139, 253, 0.42)',
  nextBorder: '#3d8bfd',
  nextWick: '#5aa2ff',
  plus1Body: 'rgba(110, 176, 255, 0.45)',
  plus1Border: '#6eb0ff',
  plus1Wick: '#8ec4ff',
  // Distinct from +1 so the 2nd suggestion is obvious on the right edge
  plus2Body: 'rgba(240, 165, 0, 0.38)',
  plus2Border: '#f0a500',
  plus2Wick: '#ffc24d',
}

const DEFAULT_VISIBLE = 100

type Props = {
  candles: Candle[]
  suggestions: DualCandleSuggestions | null
  livePrice?: number
  mark: MarkPrint
}

type HoverInfo = {
  openTime: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  forming?: boolean
  isNext?: boolean
}

function suggestionHighlight(bias: NextCandleSuggestion['bias'] | undefined) {
  const label =
    bias === 'bullish' ? 'NEXT ▲' : bias === 'bearish' ? 'NEXT ▼' : 'NEXT ·'
  return {
    body: COLORS.nextBody,
    border: COLORS.nextBorder,
    wick: COLORS.nextWick,
    label,
  }
}

export function CandleChart({ candles, suggestions, livePrice, mark }: Props) {
  const suggestion = suggestions?.plus1 ?? null
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const byTimeRef = useRef<Map<number, HoverInfo>>(new Map())
  const barCountRef = useRef(0)
  const userInteractedRef = useRef(false)
  const initialViewDoneRef = useRef(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const glow = useMemo(
    () => suggestionHighlight(suggestion?.bias),
    [suggestion?.bias],
  )

  const resetView = useCallback(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    const n = barCountRef.current
    if (n <= 0) return
    const show = Math.min(DEFAULT_VISIBLE, Math.max(n - 2, 20))
    // Pad right so forming + suggestion +1/+2 candles are visible
    chart.timeScale().applyOptions({ rightOffset: 12 })
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(-0.5, n - show - 0.5),
      to: n + 3,
    })
    series.priceScale().applyOptions({ autoScale: true })
    userInteractedRef.current = false
  }, [])

  const zoomTime = useCallback((factor: number) => {
    const chart = chartRef.current
    if (!chart) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    userInteractedRef.current = true
    const mid = (range.from + range.to) / 2
    const half = Math.max(3, ((range.to - range.from) / 2) * factor)
    chart.timeScale().setVisibleLogicalRange({
      from: mid - half,
      to: mid + half,
    })
    seriesRef.current?.priceScale().applyOptions({ autoScale: true })
  }, [])

  const panTime = useCallback((bars: number) => {
    const chart = chartRef.current
    if (!chart) return
    userInteractedRef.current = true
    // animated kinetic-style nudge
    chart.timeScale().scrollToPosition(
      (chart.timeScale().scrollPosition() || 0) + bars,
      true,
    )
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.text,
        fontFamily: 'Roboto Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid, style: LineStyle.Solid },
        horzLines: { color: COLORS.grid, style: LineStyle.Solid },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.06, bottom: 0.28 },
        // allow drag on price axis for Y zoom
        entireTextOnly: false,
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 10,
        minBarSpacing: 3,
        lockVisibleTimeRangeOnResize: false,
        tickMarkFormatter: (time: Time) => {
          const sec = typeof time === 'number' ? time : 0
          return formatClock(sec, EXCHANGE_TZ, false)
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          const sec = typeof time === 'number' ? time : 0
          return `${formatClock(sec, EXCHANGE_TZ, false)} CT / ${formatClock(sec, DISPLAY_ET, false)} ET`
        },
      },
      // Tradovate-like interaction
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
      kineticScroll: {
        mouse: true,
        touch: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: COLORS.cross,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1f252e',
        },
        horzLine: {
          color: COLORS.cross,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1f252e',
        },
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.upBorder,
      borderDownColor: COLORS.downBorder,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      borderVisible: true,
      wickVisible: true,
      priceLineVisible: true,
      lastValueVisible: true,
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      borderVisible: false,
    })

    chartRef.current = chart
    seriesRef.current = series
    volumeRef.current = volume
    markersRef.current = createSeriesMarkers(series, [])

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time) {
        setHover(null)
        return
      }
      const sec = typeof param.time === 'number' ? param.time : 0
      setHover(byTimeRef.current.get(sec) ?? null)
    }
    chart.subscribeCrosshairMove(onMove)

    // Only real pointer gestures count as "user moved the chart"
    const markInteract = () => {
      userInteractedRef.current = true
    }
    el.addEventListener('wheel', markInteract, { passive: true })
    el.addEventListener('mousedown', markInteract)
    el.addEventListener('touchstart', markInteract, { passive: true })

    const onDblClick = () => {
      resetView()
    }
    el.addEventListener('dblclick', onDblClick)

    return () => {
      el.removeEventListener('wheel', markInteract)
      el.removeEventListener('mousedown', markInteract)
      el.removeEventListener('touchstart', markInteract)
      el.removeEventListener('dblclick', onDblClick)
      chart.unsubscribeCrosshairMove(onMove)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      volumeRef.current = null
      markersRef.current = null
      linesRef.current = []
      initialViewDoneRef.current = false
    }
  }, [resetView])

  useEffect(() => {
    const series = seriesRef.current
    const volume = volumeRef.current
    const chart = chartRef.current
    const markersApi = markersRef.current
    if (!series || !volume || !chart || !candles.length) return

    // Full history for pan — not truncated to ~90
    const slice = candles.length > 400 ? candles.slice(-400) : candles
    const last = slice[slice.length - 1]
    const markInLast =
      mark.sourceTime >= last.time && mark.sourceTime < last.time + BAR_SEC

    const candleData: CandlestickData<Time>[] = []
    const volData: HistogramData<Time>[] = []
    const map = new Map<number, HoverInfo>()

    // Real history + Tradovate-style forming bar (blue).
    for (let i = 0; i < slice.length; i++) {
      const c = slice[i]
      const isForming =
        Boolean(c.forming) || (i === slice.length - 1 && markInLast)
      let close = c.close
      let high = c.high
      let low = c.low
      // Morph forming OHLC in place with mark ticks (open stays fixed)
      if (isForming && livePrice != null) {
        close = livePrice
        high = Math.max(c.high, c.open, livePrice)
        low = Math.min(c.low, c.open, livePrice)
      }

      const point: CandlestickData<Time> = {
        time: c.time as Time,
        open: c.open,
        high,
        low,
        close,
      }
      if (isForming) {
        point.color = glow.body
        point.borderColor = glow.border
        point.wickColor = glow.wick
      }
      candleData.push(point)
      volData.push({
        time: c.time as Time,
        value: c.volume,
        color: isForming
          ? 'rgba(61, 139, 253, 0.45)'
          : close >= c.open
            ? COLORS.volUp
            : COLORS.volDown,
      })
      map.set(c.time, {
        openTime: c.time,
        closeTime: c.closeTime ?? c.time + BAR_SEC,
        open: c.open,
        high,
        low,
        close,
        volume: c.volume,
        forming: isForming,
      })
    }

    // Visible suggestion candles for +1 and +2 (labeled — not real prints).
    // Anchor after the rightmost REAL bar so delayed Yahoo bars never collide
    // with suggestion times (duplicates would hide +2).
    const formingOpen =
      (slice.find((c) => c.forming) ?? last).time
    const lastRealTime = last.time
    const existingTimes = new Set(
      candleData.map((c) => c.time as unknown as number),
    )
    let plus1Time = formingOpen + BAR_SEC
    let plus2Time = formingOpen + BAR_SEC * 2
    if (
      existingTimes.has(plus1Time) ||
      existingTimes.has(plus2Time) ||
      plus1Time <= lastRealTime
    ) {
      plus1Time = lastRealTime + BAR_SEC
      plus2Time = lastRealTime + BAR_SEC * 2
    }
    const markPx = livePrice ?? last.close

    const pushSuggestionCandle = (
      horizon: 1 | 2,
      openTime: number,
      bias: NextCandleSuggestion['bias'],
      inv: number,
      _refClose: number,
    ) => {
      const open = markPx
      let close = open
      let high = open
      let low = open
      // Always draw a readable body so +1/+2 are obvious on the chart
      const body = Math.max(
        horizon === 2 ? 18 : 14,
        Math.min(32, Math.abs(inv - open) * 0.55 || (horizon === 2 ? 22 : 16)),
      )
      if (bias === 'bearish') {
        close = open - body
        low = Math.min(close - 8, inv < open ? inv : close - 8)
        high = open + 5
      } else if (bias === 'bullish') {
        close = open + body
        high = Math.max(close + 8, inv > open ? inv : close + 8)
        low = open - 5
      } else {
        high = open + body * 0.5
        low = open - body * 0.5
        close = open + (horizon === 2 ? -3 : 3)
      }
      const style =
        horizon === 1
          ? {
              color: COLORS.plus1Body,
              borderColor: COLORS.plus1Border,
              wickColor: COLORS.plus1Wick,
            }
          : {
              color: COLORS.plus2Body,
              borderColor: COLORS.plus2Border,
              wickColor: COLORS.plus2Wick,
            }
      candleData.push({
        time: openTime as Time,
        open,
        high,
        low,
        close,
        ...style,
      })
      volData.push({
        time: openTime as Time,
        value: horizon === 2 ? Math.max(1, last.volume * 0.15) : 0,
        color:
          horizon === 1
            ? 'rgba(110, 176, 255, 0.4)'
            : 'rgba(240, 165, 0, 0.45)',
      })
      map.set(openTime, {
        openTime,
        closeTime: openTime + BAR_SEC,
        open,
        high,
        low,
        close,
        volume: 0,
        isNext: true,
        forming: false,
      })
    }

    if (suggestions?.plus1) {
      pushSuggestionCandle(
        1,
        plus1Time,
        suggestions.plus1.bias,
        suggestions.plus1.invalidation,
        suggestions.plus1.lastClose,
      )
    }
    if (suggestions?.plus2) {
      pushSuggestionCandle(
        2,
        plus2Time,
        suggestions.plus2.bias,
        suggestions.plus2.invalidation,
        suggestions.plus2.lastClose,
      )
    }

    byTimeRef.current = map
    barCountRef.current = candleData.length
    series.setData(candleData)
    volume.setData(volData)

    const formingBar =
      slice.find((c) => c.forming) ?? (markInLast ? last : undefined)
    const markers: SeriesMarker<Time>[] = []
    if (formingBar) {
      markers.push({
        time: formingBar.time as Time,
        position: 'aboveBar',
        color: glow.border,
        shape: 'arrowDown',
        text: 'FORMING',
      })
    }
    if (suggestions?.plus1) {
      markers.push({
        time: plus1Time as Time,
        position: 'aboveBar',
        color: COLORS.plus1Border,
        shape: 'circle',
        text: '+1',
      })
    }
    if (suggestions?.plus2) {
      markers.push({
        time: plus2Time as Time,
        position: 'aboveBar',
        color: COLORS.plus2Border,
        shape: 'arrowUp',
        text: '+2',
      })
    }
    markersApi?.setMarkers(markers)

    // Always keep +1/+2 suggestion candles in the default window unless user panned/zoomed
    const n = candleData.length
    const show = Math.min(DEFAULT_VISIBLE, Math.max(n - 2, 20))
    const applyDefaultRange = () => {
      chart.timeScale().applyOptions({ rightOffset: 12 })
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(-0.5, n - show - 0.5),
        // n already includes +1/+2 — pad past the last suggestion bar
        to: n + 3,
      })
    }
    if (!initialViewDoneRef.current) {
      initialViewDoneRef.current = true
      applyDefaultRange()
    } else if (!userInteractedRef.current) {
      applyDefaultRange()
    }
  }, [candles, suggestion, suggestions, livePrice, mark, glow])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || !suggestion) return
    for (const line of linesRef.current) series.removePriceLine(line)
    const price = livePrice ?? suggestion.lastClose
    linesRef.current = [
      series.createPriceLine({
        price: suggestion.invalidation,
        color: COLORS.invalid,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '+1 INV',
      }),
      ...(suggestions?.plus2
        ? [
            series.createPriceLine({
              price: suggestions.plus2.invalidation,
              color: '#7c8db5',
              lineWidth: 1,
              lineStyle: LineStyle.SparseDotted,
              axisLabelVisible: true,
              title: '+2 INV',
            }),
          ]
        : []),
      series.createPriceLine({
        price: suggestion.ema9,
        color: COLORS.ema,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'EMA9',
      }),
      series.createPriceLine({
        price,
        color: COLORS.nextBorder,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'MARK',
      }),
    ]
  }, [suggestion, suggestions, livePrice])

  const forming = candles.find((c) => c.forming) ?? candles[candles.length - 1]

  const btn =
    'rounded border border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-2 py-1 text-[11px] font-semibold text-[var(--tvate-text)] hover:bg-[#222833] active:bg-[#2a313c]'

  return (
    <div className="relative flex h-full min-h-[520px] w-full flex-col bg-[var(--tvate-bg)]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--tvate-border)] bg-[var(--tvate-panel)] px-2 py-1">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-[var(--tvate-muted)]">
          Chart nav
        </span>
        <button type="button" className={btn} onClick={() => zoomTime(0.75)} title="Zoom in (time)">
          +
        </button>
        <button type="button" className={btn} onClick={() => zoomTime(1.35)} title="Zoom out (time)">
          −
        </button>
        <button type="button" className={btn} onClick={() => panTime(8)} title="Pan left">
          ←
        </button>
        <button type="button" className={btn} onClick={() => panTime(-8)} title="Pan right">
          →
        </button>
        <button type="button" className={btn} onClick={resetView} title="Reset to last ~100 bars">
          Reset
        </button>
        <span className="ml-2 text-[10px] text-[var(--tvate-muted)]">
          Wheel zoom · drag pan · pinch · Shift/axis-drag price · dbl-click reset
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={wrapRef}
          className="absolute inset-0 cursor-crosshair"
          aria-label="Tradovate-style NQZ6 5-minute chart (CME time)"
        />

        <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[340px] space-y-1.5">
          {suggestions && (
            <div
              className="rounded border px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{
                background: 'rgba(18, 21, 26, 0.94)',
                borderColor: COLORS.nextBorder,
                color: COLORS.nextBorder,
              }}
            >
              <div className="font-semibold tracking-wide">
                {glow.label} · +1 / +2 SUGGESTION
              </div>
              <div className="mt-1 font-mono text-[10px] leading-snug text-[var(--tvate-text)]">
                <div>
                  <span className="text-[#5aa2ff]">+1 {suggestions.plus1.bucketLabel}</span>
                  {' · '}
                  {suggestions.plus1.oneLiner}
                </div>
                <div className="mt-1 text-[var(--tvate-muted)]">
                  <span className="text-[#f0a500]">+2 {suggestions.plus2.bucketLabel}</span>
                  {' · '}
                  {suggestions.plus2.oneLiner}
                </div>
              </div>
            </div>
          )}

          <div className="rounded border border-[var(--tvate-border)] bg-[rgba(18,21,26,0.92)] px-2.5 py-1.5 font-mono text-[10px] text-[var(--tvate-muted)]">
            <div className="text-[var(--tvate-text)]">
              Forming = live bar · +1/+2 = next closed buckets (labels only)
            </div>
            {forming && (
              <div>
                Forming{' '}
                <span className="text-[#5aa2ff]">
                  {formatClock(forming.time, EXCHANGE_TZ)}–
                  {formatClock(forming.time + BAR_SEC, EXCHANGE_TZ)} CT
                </span>
                {' · '}
                mark {formatClock(mark.sourceTime, EXCHANGE_TZ, true)} CT
              </div>
            )}
            {suggestions && (
              <div>
                Chart candles:{' '}
                <span className="text-[#5aa2ff]">FORMING</span>
                {' · '}
                <span className="text-[#6eb0ff]">+1 {suggestions.plus1.bucketLabel}</span>
                {' · '}
                <span className="text-[#f0a500]">+2 {suggestions.plus2.bucketLabel}</span>
              </div>
            )}
          </div>

          {hover && (
            <div className="rounded border border-[var(--tvate-border)] bg-[rgba(18,21,26,0.95)] px-2.5 py-1.5 font-mono text-[10px] text-[var(--tvate-text)]">
              <div className="text-[var(--tvate-muted)]">
                {hover.forming ? 'Forming' : 'Bar'} ·{' '}
                {formatInZone(hover.openTime, EXCHANGE_TZ)} CT →{' '}
                {formatClock(hover.closeTime, EXCHANGE_TZ)} CT
              </div>
              <div className="text-[var(--tvate-muted)]">
                ET {formatClock(hover.openTime, DISPLAY_ET)}–
                {formatClock(hover.closeTime, DISPLAY_ET)}
              </div>
              <div>
                O {hover.open.toFixed(2)} · H {hover.high.toFixed(2)} · L{' '}
                {hover.low.toFixed(2)} · C {hover.close.toFixed(2)}
              </div>
              <div className="text-[var(--tvate-muted)]">
                Vol {Math.round(hover.volume).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
