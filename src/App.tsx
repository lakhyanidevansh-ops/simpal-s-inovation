import { CandleChart } from './components/CandleChart'
import { FreshnessBanner } from './components/FreshnessBanner'
import { KeyLevels } from './components/KeyLevels'
import { LivePriceStrip } from './components/LivePriceStrip'
import { OrderTicketPanel } from './components/OrderTicketPanel'
import { RecentCandles } from './components/RecentCandles'
import { TradovateGate } from './components/TradovateGate'
import { useLiveNqz6 } from './hooks/useLiveNqz6'

export default function App() {
  const {
    snapshot,
    suggestions,
    suggestion,
    status,
    error,
    lastSuccessAt,
    pollMs,
    now,
    priceFlash,
    tickGapUs,
    feedMode,
    tradovateConfigured,
    tradovateStatus,
    tradovateError,
    missingCidSec,
  } = useLiveNqz6()

  const live = Boolean(snapshot && suggestions)
  const isTick = feedMode === 'tradovate-tick'

  return (
    <div className="flex h-full min-h-screen flex-col bg-[var(--tvate-bg)] text-[var(--tvate-text)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--tvate-border)] bg-[var(--tvate-panel)] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1f6feb] text-[11px] font-bold">
            T
          </div>
          <div>
            <div className="text-[13px] font-semibold leading-tight">
              Tradovate MD · NQZ6
            </div>
            <div className="text-[10px] text-[var(--tvate-muted)]">
              Gujju Gaming / Trading Cycle · prices from Tradovate when keys are
              set (never TradingView)
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded border border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-2 py-1 font-mono">
            NQZ6 · tick SSE
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-2 py-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: isTick
                  ? 'var(--tvate-up)'
                  : status === 'loading'
                    ? 'var(--tvate-warn)'
                    : 'var(--tvate-down)',
              }}
            />
            <span>{isTick ? 'tick-stream' : status}</span>
            <span className="text-[var(--tvate-muted)]">
              {isTick
                ? ` · gap ${tickGapUs != null ? `${tickGapUs}µs` : '—'}`
                : ` · structure ${pollMs / 1000}s`}
              {lastSuccessAt
                ? ` · paint ${Math.max(0, Math.round(now - lastSuccessAt))}ms`
                : ''}
            </span>
          </span>
        </div>
      </header>

      <TradovateGate
        configured={tradovateConfigured}
        status={tradovateStatus}
        feedMode={feedMode ?? null}
        authError={tradovateError}
        missingCidSec={missingCidSec}
      />

      {snapshot && <FreshnessBanner mark={snapshot.mark} />}

      {snapshot && (
        <LivePriceStrip
          snapshot={snapshot}
          now={now}
          flash={priceFlash}
          pollMs={pollMs}
          status={status}
          tickGapUs={tickGapUs}
          feedMode={feedMode ?? null}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-3 py-1.5 text-[11px] text-[var(--tvate-muted)]">
        <span className="rounded bg-[var(--tvate-bg)] px-2 py-0.5 text-[var(--tvate-text)]">
          Candlestick
        </span>
        <span>Crosshair</span>
        <span>Grid</span>
        <span className="text-[var(--tvate-warn)]">NEXT +1/+2 ON</span>
        <span className="ml-auto font-mono text-[var(--tvate-text)]">
          {isTick
            ? 'Mark: Tradovate MD tick stream · 5m bars: Tradovate when subscribed'
            : 'Mark/structure fallback: delayed Yahoo (not TradingView) until Tradovate keys'}
        </span>
      </div>

      {status === 'loading' && !snapshot && (
        <div className="flex flex-1 items-center justify-center text-[var(--tvate-muted)]">
          Connecting mark stream + 5m structure…
        </div>
      )}

      {status === 'error' && !snapshot && (
        <div className="m-4 rounded border border-[var(--tvate-down)] bg-[#2a1212] p-4 text-[var(--tvate-down)]">
          <p className="font-semibold">Could not load market data</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {live && snapshot && suggestions && suggestion && (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-h-[460px] border-b border-[var(--tvate-border)] lg:border-b-0">
              <CandleChart
                candles={snapshot.candles}
                suggestions={suggestions}
                livePrice={snapshot.livePrice}
                mark={snapshot.mark}
              />
            </div>
            <OrderTicketPanel
              suggestions={suggestions}
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
            Feed: {snapshot.mark.source}. Mode:{' '}
            <strong className="text-[var(--tvate-text)]">
              {snapshot.mark.feedMode ?? snapshot.mark.freshness}
            </strong>
            . True tick updates need Tradovate API + CME MD entitlement. Browser
            paints every MD tick (exchange ticks are not literal 1µs clocks). Not
            advice.
            {error ? ` · ${error}` : ''}
          </footer>
        </>
      )}
    </div>
  )
}
