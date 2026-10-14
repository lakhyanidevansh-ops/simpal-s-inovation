import type { NextCandleSuggestion } from '../lib/types'

const biasStyles: Record<
  NextCandleSuggestion['bias'],
  { bg: string; text: string; ring: string; label: string }
> = {
  bullish: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    ring: 'ring-emerald-200',
    label: 'BULLISH',
  },
  bearish: {
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    ring: 'ring-rose-200',
    label: 'BEARISH',
  },
  neutral: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    ring: 'ring-slate-200',
    label: 'NEUTRAL',
  },
}

type Props = {
  suggestion: NextCandleSuggestion
}

export function SuggestionPanel({ suggestion }: Props) {
  const style = biasStyles[suggestion.bias]
  const vs =
    suggestion.expectedVsPriorClose === 'higher'
      ? `Higher than ${suggestion.lastClose.toFixed(2)}`
      : suggestion.expectedVsPriorClose === 'lower'
        ? `Lower than ${suggestion.lastClose.toFixed(2)}`
        : `Near ${suggestion.lastClose.toFixed(2)}`

  return (
    <section
      className={`rounded-2xl border border-[var(--line)] ${style.bg} p-5 shadow-sm ring-1 ${style.ring}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Next 5m candle
          </p>
          <h2 className={`font-display mt-1 text-3xl font-extrabold ${style.text}`}>
            {style.label}
          </h2>
        </div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-[var(--muted)] ring-1 ring-[var(--line)]">
          Confidence: {suggestion.confidence}
        </span>
      </div>

      <p className="mt-3 text-base font-medium text-[var(--ink)]">
        {suggestion.oneLiner}
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">{suggestion.structure}</p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-[var(--line)]">
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            vs last close
          </dt>
          <dd className="font-mono mt-1 text-sm font-semibold">{vs}</dd>
        </div>
        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-[var(--line)]">
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Target hint
          </dt>
          <dd className="font-mono mt-1 text-sm font-semibold">
            {suggestion.targetHint}
          </dd>
        </div>
        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-[var(--line)]">
          <dt className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Invalidation
          </dt>
          <dd className="font-mono mt-1 text-sm font-semibold">
            {suggestion.invalidationNote}
          </dd>
        </div>
      </dl>
    </section>
  )
}
