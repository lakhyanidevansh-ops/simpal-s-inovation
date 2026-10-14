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
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BAR_SEC,
  DISPLAY_ET,
  EXCHANGE_TZ,
  formatClock,
  formatInZone,
} from '../lib/time'
import type { Candle, MarkPrint, NextCandleSuggestion } from '../lib/types'

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
}

type Props = {
  candles: Candle[]
  suggestion: NextCandleSuggestion | null
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

export function CandleChart({ candles, suggestion, livePrice, mark }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])
  const byTimeRef = useRef<Map<number, HoverInfo>>(new Map())
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const glow = useMemo(
    () => suggestionHighlight(suggestion?.bias),
    [suggestion?.bias],
  )

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
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 4,
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
      const info = byTimeRef.current.get(sec)
      setHover(info ?? null)
    }
    chart.subscribeCrosshairMove(onMove)

    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      volumeRef.current = null
      markersRef.current = null
      linesRef.current = []
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const volume = volumeRef.current
    const chart = chartRef.current
    const markersApi = markersRef.current
    if (!series || !volume || !chart || !candles.length) return

    const slice = candles.slice(-96)
    const last = slice[slice.length - 1]
    const markInLast =
      mark.sourceTime >= last.time && mark.sourceTime < last.time + BAR_SEC

    const candleData: CandlestickData<Time>[] = []
    const volData: HistogramData<Time>[] = []
    const map = new Map<number, HoverInfo>()

    for (let i = 0; i < slice.length; i++) {
      const c = slice[i]
      // Whitespace for session gaps: LWC leaves a visual hole when times skip
      const isLast = i === slice.length - 1
      let close = c.close
      let high = c.high
      let low = c.low
      if (isLast && livePrice != null && (c.forming || markInLast)) {
        close = livePrice
        high = Math.max(high, livePrice)
        low = Math.min(low, livePrice)
      }

      const point: CandlestickData<Time> = {
        time: c.time as Time,
        open: c.open,
        high,
        low,
        close,
      }
      if ((c.forming || isLast) && suggestion) {
        point.color = glow.body
        point.borderColor = glow.border
        point.wickColor = glow.wick
      }
      candleData.push(point)
      volData.push({
        time: c.time as Time,
        value: c.volume,
        color: close >= c.open ? COLORS.volUp : COLORS.volDown,
      })
      map.set(c.time, {
        openTime: c.time,
        closeTime: c.closeTime ?? c.time + BAR_SEC,
        open: c.open,
        high,
        low,
        close,
        volume: c.volume,
        forming: c.forming,
      })
    }

    // Projected NEXT bar = next 5m bucket AFTER feed last bar (not wall-clock now)
    if (suggestion) {
      const nextTime = last.time + BAR_SEC
      const open = livePrice ?? last.close
      let high = open
      let low = open
      let close = open
      if (suggestion.bias === 'bearish') {
        const target = Math.min(suggestion.swingLow, open - 8)
        close = Math.min(open - 4, (open + target) / 2)
        low = Math.min(target, suggestion.swingLow)
        high = Math.max(open, suggestion.invalidation)
      } else if (suggestion.bias === 'bullish') {
        const target = Math.max(suggestion.swingHigh, open + 8)
        close = Math.max(open + 4, (open + target) / 2)
        high = Math.max(target, suggestion.swingHigh)
        low = Math.min(open, suggestion.invalidation)
      } else {
        high = open + 6
        low = open - 6
      }
      candleData.push({
        time: nextTime as Time,
        open,
        high,
        low,
        close,
        color: glow.body,
        borderColor: glow.border,
        wickColor: glow.wick,
      })
      volData.push({
        time: nextTime as Time,
        value: 0,
        color: 'rgba(61, 139, 253, 0.35)',
      })
      map.set(nextTime, {
        openTime: nextTime,
        closeTime: nextTime + BAR_SEC,
        open,
        high,
        low,
        close,
        volume: 0,
        isNext: true,
      })
    }

    byTimeRef.current = map
    series.setData(candleData)
    volume.setData(volData)

    const markers: SeriesMarker<Time>[] = []
    if (suggestion) {
      markers.push({
        time: last.time as Time,
        position: 'aboveBar',
        color: glow.border,
        shape: 'arrowDown',
        text: last.forming ? 'FORMING' : 'LAST',
      })
      markers.push({
        time: (last.time + BAR_SEC) as Time,
        position: 'aboveBar',
        color: glow.border,
        shape: 'circle',
        text: glow.label,
      })
    }
    markersApi?.setMarkers(markers)

    // Stay on feed timeline — do not jump to wall-clock "now"
    chart.timeScale().fitContent()
  }, [candles, suggestion, livePrice, mark, glow])

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
        title: 'INV',
      }),
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
  }, [suggestion, livePrice])

  const forming = candles.find((c) => c.forming) ?? candles[candles.length - 1]
  const nextOpen = forming ? forming.time + BAR_SEC : null

  return (
    <div className="relative h-full min-h-[520px] w-full bg-[var(--tvate-bg)]">
      <div
        ref={wrapRef}
        className="absolute inset-0"
        aria-label="Tradovate-style NQZ6 5-minute chart (CME time)"
      />

      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[340px] space-y-1.5">
        {suggestion && (
          <div
            className="rounded border px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{
              background: 'rgba(18, 21, 26, 0.94)',
              borderColor: COLORS.nextBorder,
              color: COLORS.nextBorder,
            }}
          >
            <div className="font-semibold tracking-wide">
              {glow.label} · NEXT-CANDLE CALL
            </div>
            <div className="mt-0.5 font-mono text-[10px] leading-snug text-[var(--tvate-text)]">
              {suggestion.oneLiner}
            </div>
          </div>
        )}

        <div className="rounded border border-[var(--tvate-border)] bg-[rgba(18,21,26,0.92)] px-2.5 py-1.5 font-mono text-[10px] text-[var(--tvate-muted)]">
          <div className="text-[var(--tvate-text)]">
            Axis: CME {EXCHANGE_TZ.split('/')[1]} (CT) · also shown ET in
            crosshair
          </div>
          {forming && (
            <div>
              Forming bucket{' '}
              <span className="text-[var(--tvate-text)]">
                {formatClock(forming.time, EXCHANGE_TZ)}–
                {formatClock(forming.time + BAR_SEC, EXCHANGE_TZ)} CT
              </span>
              {' · '}
              mark as-of {formatClock(mark.sourceTime, EXCHANGE_TZ, true)} CT
            </div>
          )}
          {nextOpen != null && (
            <div>
              NEXT zone opens{' '}
              <span className="text-[#5aa2ff]">
                {formatClock(nextOpen, EXCHANGE_TZ)} CT
              </span>
              {mark.freshness !== 'live' && (
                <span> · feed-time (not wall-clock now)</span>
              )}
            </div>
          )}
        </div>

        {hover && (
          <div className="rounded border border-[var(--tvate-border)] bg-[rgba(18,21,26,0.95)] px-2.5 py-1.5 font-mono text-[10px] text-[var(--tvate-text)]">
            <div className="text-[var(--tvate-muted)]">
              {hover.isNext ? 'NEXT zone' : hover.forming ? 'Forming' : 'Bar'} ·{' '}
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
  )
}
