import type { Bias } from './types'

export type StrategyId =
  | 'trend'
  | 'meanRevert'
  | 'breakout'
  | 'momentum'
  | 'macdFlow'

export type StrategyStats = {
  id: StrategyId
  hits: number
  misses: number
  /** Adaptive weight 0.35–1.8 from live outcomes */
  weight: number
}

export type LearnerState = {
  updatedAt: number
  sample: number
  strategies: Record<StrategyId, StrategyStats>
  /** Rolling direction hits for the voted call */
  voteHits: number
  voteMisses: number
}

const STORAGE_KEY = 'nqz6.liveLearner.v2'
const IDS: StrategyId[] = [
  'trend',
  'meanRevert',
  'breakout',
  'momentum',
  'macdFlow',
]

function defaultState(): LearnerState {
  const strategies = {} as Record<StrategyId, StrategyStats>
  for (const id of IDS) {
    strategies[id] = { id, hits: 0, misses: 0, weight: 1 }
  }
  return {
    updatedAt: Date.now(),
    sample: 0,
    strategies,
    voteHits: 0,
    voteMisses: 0,
  }
}

function reweight(s: StrategyStats): StrategyStats {
  const n = s.hits + s.misses
  if (n < 4) return { ...s, weight: 1 }
  const rate = s.hits / n
  const weight = Math.max(0.35, Math.min(1.8, 0.45 + (rate - 0.35) * 3.5))
  return { ...s, weight }
}

export function loadLearner(): LearnerState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as LearnerState
    if (!parsed?.strategies) return defaultState()
    for (const id of IDS) {
      if (!parsed.strategies[id]) {
        parsed.strategies[id] = { id, hits: 0, misses: 0, weight: 1 }
      } else {
        parsed.strategies[id] = reweight(parsed.strategies[id])
      }
    }
    return parsed
  } catch {
    return defaultState()
  }
}

export function saveLearner(state: LearnerState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    )
  } catch {
    /* quota / private mode */
  }
}

export function voteHitRate(state: LearnerState): number {
  const n = state.voteHits + state.voteMisses
  return n ? state.voteHits / n : 0.5
}

export function recordBarOutcome(args: {
  state: LearnerState
  strategyBias: Record<StrategyId, Bias>
  votedBias: Bias
  actual: 'up' | 'down' | 'flat'
}): LearnerState {
  const next = structuredClone(args.state) as LearnerState
  const actualBias: Bias =
    args.actual === 'up'
      ? 'bullish'
      : args.actual === 'down'
        ? 'bearish'
        : 'neutral'

  for (const id of IDS) {
    const pred = args.strategyBias[id]
    if (pred === 'neutral' || actualBias === 'neutral') continue
    if (pred === actualBias) next.strategies[id].hits += 1
    else next.strategies[id].misses += 1
    next.strategies[id] = reweight(next.strategies[id])
  }

  if (args.votedBias !== 'neutral' && actualBias !== 'neutral') {
    if (args.votedBias === actualBias) next.voteHits += 1
    else next.voteMisses += 1
    next.sample += 1
  }

  next.updatedAt = Date.now()
  saveLearner(next)
  return next
}

export function strategyLabel(id: StrategyId): string {
  switch (id) {
    case 'trend':
      return 'Trend (EMA/ADX)'
    case 'meanRevert':
      return 'Mean revert (BB/RSI)'
    case 'breakout':
      return 'Breakout'
    case 'momentum':
      return 'Momentum (Z/Stoch)'
    case 'macdFlow':
      return 'MACD flow'
  }
}
