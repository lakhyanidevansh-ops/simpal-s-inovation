import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Candle, NextCandleSuggestion } from '../lib/types'

const BAR_SEC = 300

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
  bullGlow: '#2ecc71',
  bearGlow: '#e74c3c',
  neutralGlow: '#f0a500',
  invalid: '#f0a500',
  ema: '#3d8bfd',
}

type Props = {
  candles: Candle[]
  suggestion: NextCandleSuggestion | null
}

function biasColors(bias: NextCandleSuggestion['bias'] | undefined) {
  if (bias === 'bullish') {
    return {
      body: 'rgba(46, 204, 113, 0.38)',
      border: COLORS.bullGlow,
      wick: COLORS.bullGlow,
      label: 'NEXT ▲',
    }
  }
  if (bias === 'bearish') {
    return {
      body: 'rgba(231, 76, 60, 0.38)',
      border: COLORS.bearGlow,
      wick: COLORS.bearGlow,
      label: 'NEXT ▼',
    }
  }
  return {
    body: 'rgba(240, 165, 0, 0.3)',
    border: COLORS.neutralGlow,
    wick: COLORS.neutralGlow,
    label: 'NEXT ·',
  }
}

export function CandleChart({ candles, suggestion }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])

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
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 9,
      },
      crosshair: {
        mode: 1,
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
      priceLineVisible: true,
      lastValueVisible: true,
    })

    chartRef.current = chart
    seriesRef.current = series
    markersRef.current = createSeriesMarkers(series, [])

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markersRef.current = null
      linesRef.current = []
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    const markersApi = markersRef.current
    if (!series || !chart || !candles.length) return

    const slice = candles.slice(-90)
    const last = slice[slice.length - 1]
    const glow = biasColors(suggestion?.bias)

    const data: CandlestickData<Time>[] = slice.map((c, idx) => {
      const base: CandlestickData<Time> = {
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }
      if (idx === slice.length - 1 && suggestion) {
        return {
          ...base,
          color: glow.body,
          borderColor: glow.border,
          wickColor: glow.wick,
        }
      }
      return base
    })

    if (suggestion) {
      const nextTime = (last.time + BAR_SEC) as Time
      const open = last.close
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

      data.push({
        time: nextTime,
        open,
        high,
        low,
        close,
        color: glow.body,
        borderColor: glow.border,
        wickColor: glow.wick,
      })
    }

    series.setData(data)

    const markers: SeriesMarker<Time>[] = suggestion
      ? [
          {
            time: last.time as Time,
            position: 'aboveBar',
            color: glow.border,
            shape: 'arrowDown',
            text: 'FORMING',
          },
          {
            time: (last.time + BAR_SEC) as Time,
            position: 'aboveBar',
            color: glow.border,
            shape: 'circle',
            text: glow.label,
          },
        ]
      : []
    markersApi?.setMarkers(markers)

    chart.timeScale().scrollToRealTime()
  }, [candles, suggestion])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || !suggestion) return

    for (const line of linesRef.current) series.removePriceLine(line)

    const glow = biasColors(suggestion.bias)
    const specs = [
      {
        price: suggestion.invalidation,
        color: COLORS.invalid,
        title: 'INV',
        style: LineStyle.Dashed,
      },
      {
        price: suggestion.ema9,
        color: COLORS.ema,
        title: 'EMA9',
        style: LineStyle.Dotted,
      },
      {
        price: suggestion.lastClose,
        color: glow.border,
        title: 'LAST',
        style: LineStyle.Solid,
      },
    ]

    linesRef.current = specs.map((l) =>
      series.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: l.style,
        axisLabelVisible: true,
        title: l.title,
      }),
    )
  }, [suggestion])

  return (
    <div className="relative h-full min-h-[460px] w-full bg-[var(--tvate-bg)]">
      <div
        ref={wrapRef}
        className="absolute inset-0"
        aria-label="Tradovate-style NQZ6 5-minute chart"
      />
      {suggestion && (
        <div
          className="pointer-events-none absolute left-3 top-3 z-10 max-w-[300px] rounded border px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{
            background: 'rgba(18, 21, 26, 0.94)',
            borderColor: biasColors(suggestion.bias).border,
            color: biasColors(suggestion.bias).border,
          }}
        >
          <div className="font-semibold tracking-wide">
            {biasColors(suggestion.bias).label} · LIVE SUGGESTION
          </div>
          <div className="mt-0.5 font-mono text-[10px] leading-snug text-[var(--tvate-text)]">
            {suggestion.oneLiner}
          </div>
        </div>
      )}
    </div>
  )
}
