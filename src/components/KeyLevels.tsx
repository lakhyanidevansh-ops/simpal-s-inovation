import type { NextCandleSuggestion } from '../lib/types'

type Props = {
  suggestion: NextCandleSuggestion
}

export function KeyLevels({ suggestion }: Props) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <h3 className="font-display text-lg font-bold">Key 5m levels</h3>
      <ul className="mt-3 space-y-2">
        {suggestion.keyLevels.map((lvl) => (
          <li
            key={lvl.label}
            className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2 text-sm last:border-0 last:pb-0"
          >
            <span className="text-[var(--muted)]">{lvl.label}</span>
            <span className="font-mono font-semibold">{lvl.value.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
