import { CandleChart } from './components/CandleChart'
import { KeyLevels } from './components/KeyLevels'
import { RecentCandles } from './components/RecentCandles'
import { SuggestionPanel } from './components/SuggestionPanel'
import { useLiveNqz6 } from './hooks/useLiveNqz6'

function formatClock(ts: number | null): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts))
}

export default function App() {
  const { snapshot, suggestion, status, error, lastSuccessAt, pollMs } =
    useLiveNqz6()

  const live = status === 'live' && snapshot && suggestion

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Gujju Gaming · Trading Cycle
          </p>
          <h1 className="font-display mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
            NQZ6 Live
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Near-live Nasdaq-100 Dec futures (NQZ26.CME) on the 5-minute
            chart, with an auto-refreshing next-candle suggestion.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-right shadow-sm">
          <div className="flex items-center justify-end gap-2 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                status === 'live'
                  ? 'bg-emerald-500'
                  : status === 'loading'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
              }`}
            />
            <span className="font-medium capitalize">{status}</span>
          </div>
          <p className="font-mono mt-1 text-xs text-[var(--muted)]">
            Poll every {pollMs / 1000}s · last OK {formatClock(lastSuccessAt)} ET
          </p>
        </div>
      </header>

      {status === 'loading' && !snapshot && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center text-[var(--muted)]">
          Loading NQZ6 5m candles from Yahoo…
        </div>
      )}

      {status === 'error' && !snapshot && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <p className="font-semibold">Could not load market data</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {live && (
        <div className="space-y-5">
          <SuggestionPanel suggestion={suggestion} />

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-xl font-bold">
                  {snapshot.symbol} · 5m
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {snapshot.shortName} · {snapshot.exchange}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-semibold">
                  {snapshot.regularMarketPrice.toFixed(2)}
                </p>
                {snapshot.previousClose != null && (
                  <p className="text-xs text-[var(--muted)]">
                    Prev settle ~{snapshot.previousClose.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <CandleChart candles={snapshot.candles} suggestion={suggestion} />
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
            <RecentCandles
              candles={snapshot.candles}
              timeZone={snapshot.timezone}
            />
            <KeyLevels suggestion={suggestion} />
          </div>

          {error && (
            <p className="text-sm text-amber-800">
              Last refresh warning: {error} (showing prior good snapshot)
            </p>
          )}

          <footer className="rounded-xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-3 text-xs text-[var(--muted)]">
            Source: {snapshot.source}. CME futures quotes via Yahoo are often
            delayed vs the live pit/electronic book. This is a tactical 5m
            next-candle aid — not investment advice. Bars={suggestion.analyzedBars}.
          </footer>
        </div>
      )}
    </div>
  )
}
