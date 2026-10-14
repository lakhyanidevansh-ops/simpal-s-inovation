import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Candle, NextCandleSuggestion } from '../lib/types'

type Props = {
  candles: Candle[]
  suggestion: NextCandleSuggestion | null
}

export function CandleChart({ candles, suggestion }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const linesRef = useRef<IPriceLine[]>([])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#f7f9fc' },
        textColor: '#5b6b7f',
        fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#e6edf5' },
        horzLines: { color: '#e6edf5' },
      },
      rightPriceScale: { borderColor: '#d5dde8' },
      timeScale: {
        borderColor: '#d5dde8',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: '#94a3b8', labelBackgroundColor: '#0e7490' },
        horzLine: { color: '#94a3b8', labelBackgroundColor: '#0e7490' },
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0f7a4a',
      downColor: '#b42318',
      borderUpColor: '#0f7a4a',
      borderDownColor: '#b42318',
      wickUpColor: '#0f7a4a',
      wickDownColor: '#b42318',
    })

    chartRef.current = chart
    seriesRef.current = series

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      linesRef.current = []
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart || !candles.length) return

    const slice = candles.slice(-96)
    const data: CandlestickData<Time>[] = slice.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    series.setData(data)
    chart.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || !suggestion) return

    for (const line of linesRef.current) series.removePriceLine(line)

    const specs = [
      { price: suggestion.swingLow, color: '#7f1d1d', title: 'Swing L' },
      { price: suggestion.swingHigh, color: '#14532d', title: 'Swing H' },
      { price: suggestion.invalidation, color: '#b45309', title: 'Invalid' },
      { price: suggestion.ema9, color: '#2563eb', title: 'EMA9' },
    ]

    linesRef.current = specs.map((l) =>
      series.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: l.title,
      }),
    )
  }, [suggestion])

  return (
    <div
      ref={wrapRef}
      className="h-[420px] w-full overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
      aria-label="NQZ6 5-minute candlestick chart"
    />
  )
}
