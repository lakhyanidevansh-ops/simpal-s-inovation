import { BAR_SEC, EXCHANGE_TZ, formatClock } from '../lib/time'
import type { Candle } from '../lib/types'

type Props = {
  candles: Candle[]
  timeZone: string
}

export function RecentCandles({ candles }: Props) {
  const rows = candles.slice(-8).reverse()

  return (
    <section className="overflow-hidden border-t border-[var(--tvate-border)] bg-[var(--tvate-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--tvate-border)] px-3 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tvate-muted)]">
          5m bars · CME CT open times
        </h3>
        <span className="text-[10px] text-[var(--tvate-muted)]">
          Exact xx:00 / xx:05 … · {EXCHANGE_TZ}
        </span>
      </div>
      <div className="tvate-scroll overflow-x-auto">
        <table className="min-w-full text-left text-[11px]">
          <thead className="bg-[var(--tvate-panel-2)] text-[10px] uppercase tracking-wide text-[var(--tvate-muted)]">
            <tr>
              <th className="px-3 py-1.5 font-medium">Open CT</th>
              <th className="px-3 py-1.5 font-medium">Close CT</th>
              <th className="px-3 py-1.5 font-medium">O</th>
              <th className="px-3 py-1.5 font-medium">H</th>
              <th className="px-3 py-1.5 font-medium">L</th>
              <th className="px-3 py-1.5 font-medium">C</th>
              <th className="px-3 py-1.5 font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const up = c.close >= c.open
              const closeT = c.closeTime ?? c.time + BAR_SEC
              return (
                <tr
                  key={c.time}
                  className="border-t border-[var(--tvate-border-soft)]"
                  style={
                    c.forming
                      ? { background: 'rgba(61, 139, 253, 0.1)' }
                      : c.gapFromPrevSec
                        ? { background: 'rgba(240, 165, 0, 0.06)' }
                        : undefined
                  }
                >
                  <td className="font-mono px-3 py-1">
                    {formatClock(c.time, EXCHANGE_TZ)}
                    {c.forming ? ' · F' : ''}
                    {c.gapFromPrevSec ? ' · gap' : ''}
                  </td>
                  <td className="font-mono px-3 py-1 text-[var(--tvate-muted)]">
                    {formatClock(closeT, EXCHANGE_TZ)}
                  </td>
                  <td className="font-mono px-3 py-1">{c.open.toFixed(2)}</td>
                  <td className="font-mono px-3 py-1">{c.high.toFixed(2)}</td>
                  <td className="font-mono px-3 py-1">{c.low.toFixed(2)}</td>
                  <td
                    className="font-mono px-3 py-1 font-semibold"
                    style={{
                      color: up ? 'var(--tvate-up)' : 'var(--tvate-down)',
                    }}
                  >
                    {c.close.toFixed(2)}
                  </td>
                  <td className="font-mono px-3 py-1 text-[var(--tvate-muted)]">
                    {Math.round(c.volume).toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
