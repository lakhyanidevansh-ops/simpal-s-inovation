import type { DualCandleSuggestions, HorizonSuggestion } from '../lib/types'

type Props = {
  suggestions: DualCandleSuggestions
  lastPrice: number
  symbol: string
}

function biasAccent(bias: HorizonSuggestion['bias']) {
  if (bias === 'bullish') return 'var(--tvate-up)'
  if (bias === 'bearish') return 'var(--tvate-down)'
  return 'var(--tvate-warn)'
}

function HorizonCard({
  s,
  title,
}: {
  s: HorizonSuggestion
  title: string
}) {
  const accent = biasAccent(s.bias)
  const p = s.projected

  return (
    <div
      className="rounded border px-3 py-2"
      style={{ borderColor: accent, background: 'rgba(0,0,0,0.25)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--tvate-muted)]">
          {title}
        </div>
        <div className="font-mono text-[10px] text-[#5aa2ff]">{s.bucketLabel}</div>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-base font-bold uppercase" style={{ color: accent }}>
          {s.bias}
        </div>
        <div className="font-mono text-[10px] text-[var(--tvate-muted)]">
          {s.activeStrategy}
        </div>
      </div>
      <p className="mt-0.5 font-mono text-[10px] leading-snug text-[var(--tvate-text)]">
        {s.oneLiner}
      </p>
      <dl className="mt-1.5 space-y-0.5 text-[10px]">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--tvate-muted)]">Exp close</dt>
          <dd className="font-mono text-right font-semibold">
            {p.close.toFixed(2)}
            <span className="ml-1 text-[var(--tvate-muted)]">
              ({p.movePct >= 0 ? '+' : ''}
              {p.movePct.toFixed(3)}%)
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--tvate-muted)]">Near H/L</dt>
          <dd className="font-mono text-right">
            {p.high.toFixed(2)} / {p.low.toFixed(2)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--tvate-muted)]">Tight inv</dt>
          <dd className="font-mono text-right">{s.invalidation.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--tvate-muted)]">Live hit</dt>
          <dd className="font-mono text-right">
            {Math.round(s.recentHitRate * 100)}% · {s.confidence}
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function OrderTicketPanel({ suggestions, lastPrice, symbol }: Props) {
  const lead = suggestions.plus1
  const isBull = lead.bias === 'bullish'
  const isBear = lead.bias === 'bearish'
  const accent = biasAccent(lead.bias)
  const model = suggestions.model

  return (
    <aside className="flex h-full min-h-[460px] w-full flex-col border-l border-[var(--tvate-border)] bg-[var(--tvate-panel)]">
      <div className="border-b border-[var(--tvate-border)] px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tvate-muted)]">
          Live ticket · near-price +1 / +2
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm font-semibold">{symbol}</span>
          <span className="font-mono text-lg font-semibold text-[var(--tvate-text)]">
            {lastPrice.toFixed(2)}
          </span>
        </div>
        <div className="mt-1 font-mono text-[10px] text-[var(--tvate-muted)]">
          ATR {model.atr.toFixed(2)} · learn n={model.learningSample} · cap{' '}
          {model.maxMovePct.toFixed(2)}%
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

      <div className="tvate-scroll grid grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2">
        <HorizonCard s={suggestions.plus1} title="Candle +1" />
        <HorizonCard s={suggestions.plus2} title="Candle +2" />
      </div>

      <div className="mt-auto border-t border-[var(--tvate-border)] p-3 text-[10px] text-[var(--tvate-muted)]">
        Suggestions stay near the mark (≤{model.maxMovePct.toFixed(2)}%). Four
        strategies vote; weights learn from each closed 5m bar in this browser.
      </div>
    </aside>
  )
}
