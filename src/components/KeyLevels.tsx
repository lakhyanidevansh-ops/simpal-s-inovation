import type { NextCandleSuggestion } from '../lib/types'

type Props = {
  suggestion: NextCandleSuggestion
}

export function KeyLevels({ suggestion }: Props) {
  return (
    <section className="border-t border-l border-[var(--tvate-border)] bg-[var(--tvate-panel)]">
      <div className="border-b border-[var(--tvate-border)] px-3 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--tvate-muted)]">
          Levels
        </h3>
      </div>
      <ul className="p-2">
        {suggestion.keyLevels.map((lvl) => (
          <li
            key={lvl.label}
            className="flex items-center justify-between gap-3 border-b border-[var(--tvate-border-soft)] px-1 py-1.5 text-[11px] last:border-0"
          >
            <span className="text-[var(--tvate-muted)]">{lvl.label}</span>
            <span className="font-mono font-semibold">{lvl.value.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
