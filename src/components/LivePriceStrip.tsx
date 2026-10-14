import type { MarketSnapshot } from '../lib/types'

type Props = {
  snapshot: MarketSnapshot
  now: number
  flash: 'up' | 'down' | null
  pollMs: number
  status: string
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

export function LivePriceStrip({
  snapshot,
  now,
  flash,
  pollMs,
  status,
}: Props) {
  const mark = snapshot.mark
  const ageSec = Math.max(
    mark.ageSeconds,
    Math.max(0, Math.round(now / 1000 - mark.sourceTime)),
  )
  const fetchAgeSec = Math.max(0, Math.round((now - snapshot.fetchedAt) / 1000))
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

  const badge =
    mark.freshness === 'live'
      ? { label: 'LIVE', color: 'var(--tvate-up)' }
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
                  vs prev {snapshot.previousClose.toFixed(2)} · no bid/ask on
                  this feed
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
              Data age{' '}
              <span
                className="font-mono"
                style={{
                  color:
                    ageSec > 15 ? 'var(--tvate-warn)' : 'var(--tvate-up)',
                }}
              >
                {ageSec}s
              </span>
              {' · '}
              poll {pollMs / 1000}s · last fetch {fetchAgeSec}s ago ·{' '}
              <span className="capitalize">{status}</span>
            </div>
            <div className="text-[10px]">{mark.source}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
