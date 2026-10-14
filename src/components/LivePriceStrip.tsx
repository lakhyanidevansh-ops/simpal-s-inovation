import type { MarketSnapshot } from '../lib/types'

type Props = {
  snapshot: MarketSnapshot
  now: number
  flash: 'up' | 'down' | null
  pollMs: number
  status: string
  tickGapUs: number | null
  feedMode: string | null
}

function fmtEt(msOrSec: number, isSec = false): string {
  const ms = isSec ? msOrSec * 1000 : msOrSec
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}

function fmtGap(us: number | null): string {
  if (us == null) return '—'
  if (us < 1000) return `${us} µs`
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)} ms`
  return `${(us / 1_000_000).toFixed(2)} s`
}

export function LivePriceStrip({
  snapshot,
  now,
  flash,
  pollMs,
  status,
  tickGapUs,
  feedMode,
}: Props) {
  const mark = snapshot.mark
  const ageSec = Math.max(
    mark.ageSeconds,
    Math.max(0, (now / 1000 - mark.sourceTime)),
  )
  const fetchAgeMs = Math.max(0, now - snapshot.fetchedAt)
  const up =
    snapshot.change == null
      ? null
      : snapshot.change > 0
        ? true
        : snapshot.change < 0
          ? false
          : null

  const flashClass =
    flash === 'up' ? 'price-flash-up' : flash === 'down' ? 'price-flash-down' : ''

  const changeColor =
    up === true
      ? 'var(--tvate-up)'
      : up === false
        ? 'var(--tvate-down)'
        : 'var(--tvate-muted)'

  const isTvTick = feedMode === 'tradovate-tick' || mark.freshness === 'live'
  const badge = isTvTick
    ? { label: 'LIVE TICK', color: 'var(--tvate-up)' }
    : { label: 'DELAYED', color: 'var(--tvate-warn)' }

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--tvate-border)] bg-[var(--tvate-panel)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--tvate-muted)]">
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-black"
                style={{ background: badge.color }}
              >
                {badge.label}
              </span>
              Mark · {snapshot.symbol}
              {snapshot.forming ? ' · forming 5m' : ''}
            </div>
            <div
              className={`font-mono text-4xl font-bold leading-none tracking-tight sm:text-5xl ${flashClass}`}
              style={{
                color:
                  flash === 'up'
                    ? 'var(--tvate-up)'
                    : flash === 'down'
                      ? 'var(--tvate-down)'
                      : 'var(--tvate-text)',
              }}
            >
              {snapshot.livePrice.toFixed(2)}
            </div>
          </div>

          <div className="pb-1 font-mono text-sm" style={{ color: changeColor }}>
            {snapshot.change != null && (
              <div className="font-semibold">
                {snapshot.change >= 0 ? '+' : ''}
                {snapshot.change.toFixed(2)}
                {snapshot.changePercent != null && (
                  <span className="ml-2">
                    ({snapshot.changePercent >= 0 ? '+' : ''}
                    {snapshot.changePercent.toFixed(2)}%)
                  </span>
                )}
              </div>
            )}
            {mark.bid != null && mark.ask != null ? (
              <div className="text-[11px] text-[var(--tvate-muted)]">
                bid {mark.bid.toFixed(2)} / ask {mark.ask.toFixed(2)}
              </div>
            ) : (
              snapshot.previousClose != null && (
                <div className="text-[11px] text-[var(--tvate-muted)]">
                  vs prev {snapshot.previousClose.toFixed(2)} · no bid/ask yet
                </div>
              )
            )}
          </div>

          <div className="pb-1 text-[11px] text-[var(--tvate-muted)]">
            <div>
              Source as-of{' '}
              <span className="font-mono text-[var(--tvate-text)]">
                {fmtEt(snapshot.sourceTime, true)} ET
              </span>
            </div>
            <div>
              Age{' '}
              <span
                className="font-mono"
                style={{
                  color:
                    ageSec > 2 ? 'var(--tvate-warn)' : 'var(--tvate-up)',
                }}
              >
                {(ageSec * 1000).toFixed(0)} ms
              </span>
              {' · '}
              tick gap{' '}
              <span className="font-mono text-[var(--tvate-text)]">
                {fmtGap(tickGapUs)}
              </span>
              {' · '}
              last paint {fetchAgeMs} ms ago
            </div>
            <div className="text-[10px]">
              {mark.source}
              {!isTvTick && (
                <span>
                  {' '}
                  · structure poll {pollMs / 1000}s ·{' '}
                  <span className="capitalize">{status}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
