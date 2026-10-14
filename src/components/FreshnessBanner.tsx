import type { MarkPrint } from '../lib/types'

type Props = {
  mark: MarkPrint
}

export function FreshnessBanner({ mark }: Props) {
  const isLive = mark.freshness === 'live'
  const isDelayed =
    mark.freshness === 'delayed' || mark.freshness === 'stale'

  if (isLive) {
    return (
      <div className="border-b border-emerald-800 bg-emerald-950 px-3 py-2 text-[12px] text-emerald-200">
        <strong className="tracking-wide text-emerald-300">LIVE</strong>
        {' · '}
        Real-time Tradovate mark · age {mark.ageSeconds}s · {mark.source}
        {mark.bid != null && mark.ask != null && (
          <span className="font-mono">
            {' '}
            · bid {mark.bid.toFixed(2)} / ask {mark.ask.toFixed(2)}
          </span>
        )}
      </div>
    )
  }

  if (isDelayed) {
    return (
      <div className="border-b border-amber-800 bg-[#3a2208] px-3 py-2 text-[12px] text-amber-100">
        <strong className="tracking-wide text-amber-300">
          DELAYED — NOT REAL-TIME
        </strong>
        {' · '}
        Data age <span className="font-mono">{mark.ageSeconds}s</span> ·{' '}
        {mark.source}
        <div className="mt-0.5 text-[11px] text-amber-200/90">{mark.note}</div>
        {!mark.tradovateConfigured && (
          <div className="mt-0.5 text-[11px] text-amber-200/80">
            Add Tradovate env credentials (see <code>.env.example</code>) for
            LIVE marks. Free Yahoo/CME web prints are ~10 minutes delayed by
            design.
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
