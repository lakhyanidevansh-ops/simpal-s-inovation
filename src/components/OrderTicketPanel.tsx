import type { NextCandleSuggestion } from '../lib/types'

type Props = {
  suggestion: NextCandleSuggestion
  lastPrice: number
  symbol: string
}

export function OrderTicketPanel({ suggestion, lastPrice, symbol }: Props) {
  const bias = suggestion.bias
  const isBull = bias === 'bullish'
  const isBear = bias === 'bearish'
  const accent = isBull ? 'var(--tvate-up)' : isBear ? 'var(--tvate-down)' : 'var(--tvate-warn)'
  const vs =
    suggestion.expectedVsPriorClose === 'higher'
      ? `Higher than ${suggestion.lastClose.toFixed(2)}`
      : suggestion.expectedVsPriorClose === 'lower'
        ? `Lower than ${suggestion.lastClose.toFixed(2)}`
        : `Near ${suggestion.lastClose.toFixed(2)}`

  return (
    <aside className="flex h-full min-h-[460px] w-full flex-col border-l border-[var(--tvate-border)] bg-[var(--tvate-panel)]">
      <div className="border-b border-[var(--tvate-border)] px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tvate-muted)]">
          Order ticket · next candle
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm font-semibold">{symbol}</span>
          <span className="font-mono text-lg font-semibold text-[var(--tvate-text)]">
            {lastPrice.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-[var(--tvate-border)] p-3">
        <button
          type="button"
          className="rounded px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-white"
          style={{
            background: isBull ? 'var(--tvate-buy)' : '#1a3a28',
            outline: isBull ? `2px solid ${accent}` : 'none',
            opacity: isBear ? 0.45 : 1,
          }}
        >
          Buy / Bull
        </button>
        <button
          type="button"
          className="rounded px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-white"
          style={{
            background: isBear ? 'var(--tvate-sell)' : '#3a1a1a',
            outline: isBear ? `2px solid ${accent}` : 'none',
            opacity: isBull ? 0.45 : 1,
          }}
        >
          Sell / Bear
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div
          className="rounded border px-3 py-2"
          style={{ borderColor: accent, background: 'rgba(0,0,0,0.25)' }}
        >
          <div className="text-[10px] uppercase tracking-wide text-[var(--tvate-muted)]">
            Bias
          </div>
          <div className="text-xl font-bold uppercase" style={{ color: accent }}>
            {bias}
          </div>
          <p className="mt-1 font-mono text-[11px] leading-snug text-[var(--tvate-text)]">
            {suggestion.oneLiner}
          </p>
        </div>

        <Field label="Expect close" value={vs} />
        <Field label="Target hint" value={suggestion.targetHint} />
        <Field label="Invalidation" value={suggestion.invalidationNote} />
        <Field label="Confidence" value={suggestion.confidence} />

        <div className="rounded border border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] p-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--tvate-muted)]">
            Structure
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[var(--tvate-muted)]">
            {suggestion.structure}
          </p>
        </div>
      </div>

      <div className="mt-auto border-t border-[var(--tvate-border)] p-3 text-[10px] text-[var(--tvate-muted)]">
        Highlighted chart bar = forming candle + projected next 5m zone, colored
        by live bias. Not a real order ticket — Tradovate-style chrome only.
      </div>
    </aside>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--tvate-border-soft)] pb-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--tvate-muted)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12px] text-[var(--tvate-text)]">{value}</div>
    </div>
  )
}
