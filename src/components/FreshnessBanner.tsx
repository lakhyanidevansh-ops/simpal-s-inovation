import type { MarkPrint } from '../lib/types'

type Props = {
  mark: MarkPrint
}

export function FreshnessBanner({ mark }: Props) {
  const isLive =
    mark.freshness === 'live' || mark.feedMode === 'tradovate-tick'

  if (isLive) {
    return (
      <div className="border-b border-emerald-800 bg-emerald-950 px-3 py-2 text-[12px] text-emerald-200">
        <strong className="tracking-wide text-emerald-300">LIVE · TRADOVATE</strong>
        {' · '}
        age {(mark.ageSeconds * 1000).toFixed(0)}ms
        {mark.tickGapUs != null && (
          <span className="font-mono">
            {' '}
            · last tick gap {mark.tickGapUs}µs
          </span>
        )}
        {' · '}
        {mark.source}
        {mark.bid != null && mark.ask != null && (
          <span className="font-mono">
            {' '}
            · bid {mark.bid.toFixed(2)} / ask {mark.ask.toFixed(2)}
          </span>
        )}
      </div>
    )
  }

  if (mark.freshness === 'delayed' || mark.freshness === 'stale') {
    return (
      <div className="border-b border-amber-800 bg-[#3a2208] px-3 py-2 text-[12px] text-amber-100">
        <strong className="tracking-wide text-amber-300">
          DELAYED — NOT TRADOVATE REAL-TIME
        </strong>
        {' · '}
        Data age <span className="font-mono">{mark.ageSeconds}s</span> ·{' '}
        {mark.source}
        <div className="mt-0.5 text-[11px] text-amber-200/90">{mark.note}</div>
        {!mark.tradovateConfigured && (
          <div className="mt-0.5 text-[11px] text-amber-200/80">
            Not TradingView. Add Tradovate <code>.env</code> credentials for a
            tick stream from the Tradovate platform.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border-b border-rose-900 bg-[#2a1212] px-3 py-2 text-[12px] text-rose-200">
      <strong>NO FRESH MARK</strong> · {mark.note || 'Unavailable'}
    </div>
  )
}
