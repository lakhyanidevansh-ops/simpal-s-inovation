import type { Candle } from '../lib/types'

type Props = {
  candles: Candle[]
  timeZone: string
}

function fmtTime(ts: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone === 'EDT' || timeZone === 'EST' ? 'America/New_York' : timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts * 1000))
  } catch {
    return new Date(ts * 1000).toISOString().slice(11, 16)
  }
}

export function RecentCandles({ candles, timeZone }: Props) {
  const rows = candles.slice(-10).reverse()

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h3 className="font-display text-lg font-bold">Last 10 × 5m</h3>
        <p className="text-xs text-[var(--muted)]">Times in {timeZone}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">O</th>
              <th className="px-4 py-2 font-medium">H</th>
              <th className="px-4 py-2 font-medium">L</th>
              <th className="px-4 py-2 font-medium">C</th>
              <th className="px-4 py-2 font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const up = c.close >= c.open
              return (
                <tr key={c.time} className="border-t border-[var(--line)]">
                  <td className="font-mono px-4 py-2">{fmtTime(c.time, timeZone)}</td>
                  <td className="font-mono px-4 py-2">{c.open.toFixed(2)}</td>
                  <td className="font-mono px-4 py-2">{c.high.toFixed(2)}</td>
                  <td className="font-mono px-4 py-2">{c.low.toFixed(2)}</td>
                  <td
                    className={`font-mono px-4 py-2 font-semibold ${
                      up ? 'text-[var(--bull)]' : 'text-[var(--bear)]'
                    }`}
                  >
                    {c.close.toFixed(2)}
                  </td>
                  <td className="font-mono px-4 py-2 text-[var(--muted)]">
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
