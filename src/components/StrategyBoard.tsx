import type { DualCandleSuggestions } from '../lib/types'

type Props = {
  suggestions: DualCandleSuggestions
}

function biasColor(bias: string) {
  if (bias === 'bullish') return 'var(--tvate-up)'
  if (bias === 'bearish') return 'var(--tvate-down)'
  return 'var(--tvate-muted)'
}

export function StrategyBoard({ suggestions }: Props) {
  const model = suggestions.model
  const rows = model.strategies?.length
    ? model.strategies
    : suggestions.plus1.strategies

  return (
    <div className="border-b border-[var(--tvate-border)] bg-[var(--tvate-panel-2)] px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tvate-muted)]">
          Live strategies · learning
        </div>
        <div className="font-mono text-[10px] text-[var(--tvate-muted)]">
          vote hit {Math.round(model.recentHitRate * 100)}% · n=
          {model.learningSample} · move cap {model.maxMovePct.toFixed(2)}%
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {rows.map((s) => (
          <div
            key={s.id}
            className="rounded border px-2 py-1.5"
            style={{
              borderColor: s.active ? biasColor(s.bias) : 'var(--tvate-border)',
              background: s.active ? 'rgba(61,139,253,0.08)' : 'rgba(0,0,0,0.2)',
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-[var(--tvate-text)]">
                {s.label}
                {s.active ? ' · ON' : ''}
              </span>
              <span
                className="font-mono text-[10px] uppercase"
                style={{ color: biasColor(s.bias) }}
              >
                {s.bias.slice(0, 4)}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-[var(--tvate-muted)]">
              w {s.weight.toFixed(2)} · score {s.score > 0 ? '+' : ''}
              {s.score}
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-[var(--tvate-muted)]">
              {s.reason}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-[var(--tvate-muted)]">
        Primary: <strong className="text-[var(--tvate-text)]">{suggestions.plus1.activeStrategy}</strong>
        {' · '}
        Targets stay within ~{model.maxMovePct.toFixed(2)}% of mark (ATR-scaled). Weights
        update as each 5m bar closes.
      </p>
    </div>
  )
}
