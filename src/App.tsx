import { CandleChart } from './components/CandleChart'
import { FreshnessBanner } from './components/FreshnessBanner'
import { KeyLevels } from './components/KeyLevels'
import { LivePriceStrip } from './components/LivePriceStrip'
import { OrderTicketPanel } from './components/OrderTicketPanel'
import { RecentCandles } from './components/RecentCandles'
import { useLiveNqz6 } from './hooks/useLiveNqz6'

export default function App() {
  const {
    snapshot,
    suggestion,
    status,
    error,
    lastSuccessAt,
    pollMs,
    now,
    priceFlash,
  } = useLiveNqz6()

  const live = Boolean(snapshot && suggestion)

  return (
    <div className="flex h-full min-h-screen flex-col bg-[var(--tvate-bg)] text-[var(--tvate-text)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--tvate-border)] bg-[var(--tvate-panel)] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1f6feb] text-[11px] font-bold">
            T
          </div>
          <div>
            <div className="text-[13px] font-semibold leading-tight">
              Tradovate-style · NQZ6
            </div>
            <div className="text-[10px] text-[var(--tvate-muted)]">
              Gujju Gaming / Trading Cycle · UI clone only (not live Tradovate
              data unless keys configured)
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded border border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-2 py-1 font-mono">
            NQZ26.CME · 5m
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-2 py-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background:
                  status === 'live'
                    ? 'var(--tvate-up)'
                    : status === 'loading'
                      ? 'var(--tvate-warn)'
                      : 'var(--tvate-down)',
              }}
            />
            <span className="capitalize">{status}</span>
            <span className="text-[var(--tvate-muted)]">
              · poll {pollMs / 1000}s
              {lastSuccessAt
                ? ` · ok ${Math.max(0, Math.round((now - lastSuccessAt) / 1000))}s ago`
                : ''}
            </span>
          </span>
        </div>
      </header>

      {snapshot && <FreshnessBanner mark={snapshot.mark} />}

      {snapshot && (
        <LivePriceStrip
          snapshot={snapshot}
          now={now}
          flash={priceFlash}
          pollMs={pollMs}
          status={status}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-3 py-1.5 text-[11px] text-[var(--tvate-muted)]">
        <span className="rounded bg-[var(--tvate-bg)] px-2 py-0.5 text-[var(--tvate-text)]">
          Candlestick
        </span>
        <span>Crosshair</span>
        <span>Grid</span>
        <span>Price axis</span>
        <span>Time axis</span>
        <span className="text-[var(--tvate-warn)]">NEXT bar highlight ON</span>
        <span className="ml-auto font-mono text-[var(--tvate-text)]">
          Mark from /api/mark · 5m OHLC structure may still be delayed Yahoo
        </span>
      </div>

      {status === 'loading' && !snapshot && (
        <div className="flex flex-1 items-center justify-center text-[var(--tvate-muted)]">
          Loading mark + 5m structure…
        </div>
      )}

      {status === 'error' && !snapshot && (
        <div className="m-4 rounded border border-[var(--tvate-down)] bg-[#2a1212] p-4 text-[var(--tvate-down)]">
          <p className="font-semibold">Could not load market data</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {live && snapshot && suggestion && (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-h-[460px] border-b border-[var(--tvate-border)] lg:border-b-0">
              <CandleChart
                candles={snapshot.candles}
                suggestion={suggestion}
                livePrice={snapshot.livePrice}
                mark={snapshot.mark}
              />
            </div>
            <OrderTicketPanel
              suggestion={suggestion}
              lastPrice={snapshot.livePrice}
              symbol={snapshot.symbol}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_280px]">
            <RecentCandles
              candles={snapshot.candles}
              timeZone={snapshot.timezone}
            />
            <KeyLevels suggestion={suggestion} />
          </div>

          <footer className="border-t border-[var(--tvate-border)] bg-[var(--tvate-panel)] px-3 py-2 text-[10px] text-[var(--tvate-muted)]">
            Mark source: {snapshot.mark.source}. Freshness:{' '}
            <strong className="text-[var(--tvate-text)]">
              {snapshot.mark.freshness.toUpperCase()}
            </strong>{' '}
            (LIVE only if age ≤ 15s from Tradovate MD). Yahoo-only mode is
            exchange-delayed (~10m) — not Tradovate accuracy. Set env vars in{' '}
            <code>.env.example</code>. Not advice.
            {error ? ` · refresh warn: ${error}` : ''}
          </footer>
        </>
      )}
    </div>
  )
}
