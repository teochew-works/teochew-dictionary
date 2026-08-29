import type { CardState, Grade, QueueItem } from './types'

/**
 * A hand-rolled SM-2-style scheduler. Deliberately dependency-free (no
 * ts-fsrs/supermemo package) — the algorithm is small and this keeps the
 * dependency list minimal, matching the rest of the repo.
 *
 * Every function takes `now` as an explicit parameter (defaulting to
 * `new Date()`) rather than reading the clock internally, so scheduling math
 * is deterministically unit-testable.
 */

const DEFAULT_EFACTOR = 2.5
const MIN_EFACTOR = 1.3
const EASY_BONUS = 1.3 // matches the commonly-used Anki default; not independently tuned

function quality(grade: Grade): number {
  return grade === 'again' ? 2 : grade === 'good' ? 4 : 5
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function newCardState(entryId: string, now = new Date()): CardState {
  return {
    entryId,
    efactor: DEFAULT_EFACTOR,
    interval: 0,
    repetitions: 0,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
  }
}

function nextInterval(state: CardState, grade: Grade): number {
  if (grade === 'again') return 1

  const base =
    state.repetitions === 0 ? 1 : state.repetitions === 1 ? 6 : Math.round(state.interval * state.efactor)

  return grade === 'easy' ? Math.round(base * EASY_BONUS) : base
}

/**
 * What each button would schedule, without committing to it — so the grade
 * buttons can show the real next interval ("1d", "6d", "8d") rather than a
 * fixed caption that drifts from what the scheduler actually does.
 */
export function previewIntervals(state: CardState): Record<Grade, number> {
  return {
    again: nextInterval(state, 'again'),
    good: nextInterval(state, 'good'),
    easy: nextInterval(state, 'easy'),
  }
}

export function gradeCard(state: CardState, grade: Grade, now = new Date()): CardState {
  const q = quality(grade)
  const efactor = Math.max(MIN_EFACTOR, state.efactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  const interval = nextInterval(state, grade)
  const repetitions = grade === 'again' ? 0 : state.repetitions + 1

  return {
    ...state,
    efactor,
    interval,
    repetitions,
    dueAt: addDays(now, interval).toISOString(),
    lastReviewedAt: now.toISOString(),
  }
}

/** Fisher-Yates, parameterized on `random` so callers can inject a deterministic sequence in tests. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const temp = result[i]!
    result[i] = result[j]!
    result[j] = temp
  }
  return result
}

/**
 * Due cards first (oldest due first), then never-reviewed entries up to
 * `newCardCap`, ranked by frequency so the most useful vocabulary surfaces
 * first. This is a soft, per-queue-build cap — see web/README.md.
 *
 * Entries are shuffled before the frequency sort (stable, so it only
 * reorders ties) so that cards sharing a frequency band don't always come
 * back in the same alphabetical-by-id order every session.
 */
export function buildQueue(
  entries: { id: string; frequency?: number }[],
  cards: Map<string, CardState>,
  now = new Date(),
  newCardCap = 20,
  random: () => number = Math.random,
): QueueItem[] {
  const ids = new Set(entries.map((e) => e.id))
  const due = [...cards.values()]
    .filter((c) => ids.has(c.entryId) && new Date(c.dueAt) <= now)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .map((c): QueueItem => ({ entryId: c.entryId, kind: 'due' }))

  const fresh = shuffle(
    entries.filter((e) => !cards.has(e.id)),
    random,
  )
    .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
    .slice(0, newCardCap)
    .map((e): QueueItem => ({ entryId: e.id, kind: 'new' }))

  return [...due, ...fresh]
}
