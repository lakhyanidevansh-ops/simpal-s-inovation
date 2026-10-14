type Props = {
  configured: boolean
  status: string | null
  feedMode: string | null
}

export function TradovateGate({ configured, status, feedMode }: Props) {
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

  if (configured) {
    return (
      <div className="border-b border-sky-900 bg-[#0a1520] px-3 py-2 text-[12px] text-sky-100">
        <strong className="text-sky-300">TRADOVATE CONNECTING</strong>
        {' · '}
        Credentials found · MD status{' '}
        <span className="font-mono">{status ?? '…'}</span>
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
        TRADOVATE REQUIRED FOR LIVE / MICRO-SECOND TICKS
      </strong>
      <div className="mt-1 text-[11px] leading-snug text-rose-100/90">
        This desk is <em>not</em> pulling TradingView. Without your Tradovate
        API keys it can only show exchange-delayed Yahoo as a labeled fallback.
        Paste credentials into <code className="text-rose-50">.env</code> (see{' '}
        <code className="text-rose-50">.env.example</code>), restart{' '}
        <code className="text-rose-50">npm run dev</code>, and keep CME market
        data entitlement + API Access on the account.
      </div>
      <div className="mt-1 font-mono text-[10px] text-rose-200/80">
        TRADOVATE_NAME · PASSWORD · APP_ID · CID · SEC · ENV · SYMBOL=NQZ6
      </div>
    </div>
  )
}
