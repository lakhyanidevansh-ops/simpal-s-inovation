import type { Candle } from '../lib/types'

type Props = {
  candles: Candle[]
  timeZone: string
}

function fmtTime(ts: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone:
        timeZone === 'EDT' || timeZone === 'EST'
          ? 'America/New_York'
          : timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts * 1000))
  } catch {
    return new Date(ts * 1000).toISOString().slice(11, 16)
  }
}

export function RecentCandles({ candles, timeZone }: Props) {
  const rows = candles.slice(-8).reverse()

  return (
    <section className="overflow-hidden border-t border-[var(--tvate-border)] bg-[var(--tvate-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--tvate-border)] px-3 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tvate-muted)]">
          Time & sales · 5m bars
        </h3>
        <span className="text-[10px] text-[var(--tvate-muted)]">{timeZone}</span>
      </div>
      <div className="tvate-scroll overflow-x-auto">
        <table className="min-w-full text-left text-[11px]">
          <thead className="bg-[var(--tvate-panel-2)] text-[10px] uppercase tracking-wide text-[var(--tvate-muted)]">
            <tr>
              <th className="px-3 py-1.5 font-medium">Time</th>
              <th className="px-3 py-1.5 font-medium">O</th>
              <th className="px-3 py-1.5 font-medium">H</th>
              <th className="px-3 py-1.5 font-medium">L</th>
              <th className="px-3 py-1.5 font-medium">C</th>
              <th className="px-3 py-1.5 font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const up = c.close >= c.open
              const forming = i === 0
              return (
                <tr
                  key={c.time}
                  className="border-t border-[var(--tvate-border-soft)]"
                  style={
                    forming
                      ? { background: 'rgba(61, 139, 253, 0.08)' }
                      : undefined
                  }
                >
                  <td className="font-mono px-3 py-1">
                    {fmtTime(c.time, timeZone)}
                    {forming ? ' · F' : ''}
                  </td>
                  <td className="font-mono px-3 py-1">{c.open.toFixed(2)}</td>
                  <td className="font-mono px-3 py-1">{c.high.toFixed(2)}</td>
                  <td className="font-mono px-3 py-1">{c.low.toFixed(2)}</td>
                  <td
                    className="font-mono px-3 py-1 font-semibold"
                    style={{ color: up ? 'var(--tvate-up)' : 'var(--tvate-down)' }}
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
