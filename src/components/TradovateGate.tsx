type Props = {
  configured: boolean
  status: string | null
  feedMode: string | null
  authError?: string | null
  missingCidSec?: boolean
}

export function TradovateGate({
  configured,
  status,
  feedMode,
  authError,
  missingCidSec,
}: Props) {
  if (configured && feedMode === 'tradovate-tick') {
    return (
      <div className="border-b border-emerald-900 bg-[#0b1a12] px-3 py-1.5 text-[11px] text-emerald-200">
        <strong className="text-emerald-300">TRADOVATE TICK STREAM</strong>
        {' · '}
        Prices from Tradovate MD (not TradingView, not Yahoo) · status{' '}
        <span className="font-mono">{status ?? 'live'}</span>
        {' · '}
        UI updates on every MD tick
      </div>
    )
  }

  if (configured && (status === 'error' || authError)) {
    return (
      <div className="border-b border-rose-900 bg-[#2a1010] px-3 py-2 text-[12px] text-rose-100">
        <strong className="text-rose-300">TRADOVATE AUTH / MD FAILED</strong>
        {' · '}
        status <span className="font-mono">{status ?? 'error'}</span>
        {authError && (
          <div className="mt-1 font-mono text-[11px] text-rose-200/90">
            {authError}
          </div>
        )}
        <div className="mt-1 text-[11px] leading-snug text-rose-100/90">
          Demo Trader login alone is not enough. In Tradovate → Application
          Settings → API Access: enable the add-on, create an API key, then put{' '}
          <code>TRADOVATE_CID</code>, <code>TRADOVATE_SEC</code>, and the key’s{' '}
          <strong>dedicated API password</strong> into <code>.env</code> (plus
          your username). Restart the dev server after saving.
        </div>
      </div>
    )
  }

  if (configured) {
    return (
      <div className="border-b border-sky-900 bg-[#0a1520] px-3 py-2 text-[12px] text-sky-100">
        <strong className="text-sky-300">TRADOVATE CONNECTING</strong>
        {' · '}
        Credentials found · MD status{' '}
        <span className="font-mono">{status ?? '…'}</span>
        {missingCidSec && (
          <div className="mt-0.5 text-[11px] text-amber-200/90">
            CID/SEC missing — auth often fails until you add the API key pair
            from Tradovate Settings.
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-sky-200/80">
          Waiting for first Tradovate tick. Until then the mark may show delayed
          Yahoo — never invented live prices.
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-rose-900 bg-[#2a1010] px-3 py-2 text-[12px] text-rose-100">
      <strong className="tracking-wide text-rose-300">
        TRADOVATE REQUIRED FOR LIVE TICKS
      </strong>
      <div className="mt-1 text-[11px] leading-snug text-rose-100/90">
        Not TradingView. Set <code className="text-rose-50">.env</code> with
        username, <em>API</em> password, <code>CID</code>, and <code>SEC</code>{' '}
        from Tradovate API Access, then restart <code>npm run dev</code>.
      </div>
    </div>
  )
}
