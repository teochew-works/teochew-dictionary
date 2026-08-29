import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getAllCards, putCard } from './db'
import { buildQueue, gradeCard, mergeQueue, newCardState, pruneQueue } from './scheduler'
import type { CardState, Grade, QueueItem } from './types'
import type { EnrichedEntry } from '../types/dict'

export interface SrsQueueState {
  current: QueueItem | null
  /** Every known card's scheduling state, so callers can count what's due per deck (see decks/stats.ts). */
  cardStates: Map<string, CardState>
  reviewedCount: number
  /** Cards this session covers: the ones already reviewed plus the ones still queued. */
  totalCount: number
  loading: boolean
  /** Set when IndexedDB read/write fails (e.g. locked-down private browsing) — review still works, just isn't saved. */
  persistError: string | null
  grade: (grade: Grade) => void
}

/** One table's review session. Held per table so switching tables and coming back resumes where you left off. */
interface Session {
  queue: QueueItem[]
  reviewed: number
  /** Pool size when this session was last built or topped up — a cheap "has the pool grown?" check. */
  eligibleCount: number
}

/**
 * Wires the pure scheduler (scheduler.ts) and the IndexedDB store (db.ts)
 * into a React-friendly review queue.
 *
 * The queue is *stable*: the card on screen only changes when you grade it or
 * when something makes it ineligible. Everything else the screen can do —
 * renaming a deck, filing a card, reordering the library, changing a filter
 * the card still passes — leaves it alone. Rebuilding on every pool change
 * instead would reshuffle the queue and deal a different card each time,
 * which is what this hook used to do: `buildQueue` shuffles, so an unrelated
 * deck rename dealt a new card.
 *
 * Sessions are kept per table (`tableKey`), so putting a deck on the table
 * and taking it off again returns you to the card the first table was
 * showing rather than dealing a fresh one. They live for the page load only;
 * the scheduling state behind them is what persists.
 *
 * Grading "again" re-appends the card to the in-memory queue so it resurfaces
 * later in the same session, while the persisted CardState is written
 * immediately with interval: 1 — so a reload mid-session still finds it due
 * again tomorrow, not today.
 */
export function useSrsQueue(entries: EnrichedEntry[], tableKey: string): SrsQueueState {
  const [cards, setCards] = useState<Map<string, CardState>>(new Map())
  const [sessions, setSessions] = useState<Map<string, Session>>(new Map())
  const [loading, setLoading] = useState(true)
  const [persistError, setPersistError] = useState<string | null>(null)

  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(() => {
    let cancelled = false
    getAllCards()
      .then((loaded) => {
        if (cancelled) return
        setCards(loaded)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoading(false)
        setPersistError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  /*
   * Reconciling in a layout effect rather than an ordinary one keeps the
   * frame where a newly-selected table has no session yet from ever reaching
   * the screen — otherwise switching tables flashes the "table cleared"
   * state before the queue appears.
   */
  useLayoutEffect(() => {
    if (loading) return

    setSessions((prev) => {
      const existing = prev.get(tableKey)

      if (!existing) {
        const next = new Map(prev)
        next.set(tableKey, { queue: buildQueue(entries, cards), reviewed: 0, eligibleCount: entries.length })
        return next
      }

      const kept = pruneQueue(existing.queue, new Set(entries.map((e) => e.id)))
      // Top up only when the pool actually grew, or when the queue ran dry.
      // A narrowing filter drops what it invalidated and adds nothing — it
      // would be odd for hiding cards to hand you more of them. Anything else
      // leaves the queue exactly as it is, which is what keeps the current
      // card, and the ones behind it, put.
      const resized = entries.length !== existing.eligibleCount
      const grew = entries.length > existing.eligibleCount
      const queue = grew || kept.length === 0 ? mergeQueue(kept, buildQueue(entries, cards)) : kept

      if (queue === existing.queue && !resized) return prev
      const next = new Map(prev)
      next.set(tableKey, { queue, reviewed: existing.reviewed, eligibleCount: entries.length })
      return next
    })
  }, [entries, tableKey, cards, loading])

  const grade = useCallback(
    (g: Grade) => {
      const session = sessionsRef.current.get(tableKey)
      const head = session?.queue[0]
      if (!session || !head) return

      const nextState = gradeCard(cards.get(head.entryId) ?? newCardState(head.entryId), g)
      setCards((prev) => new Map(prev).set(head.entryId, nextState))
      putCard(nextState).catch((err: unknown) => {
        setPersistError(err instanceof Error ? err.message : String(err))
      })

      setSessions((prev) => {
        const current = prev.get(tableKey)
        if (!current) return prev
        const [, ...rest] = current.queue
        const next = new Map(prev)
        next.set(tableKey, {
          ...current,
          queue: g === 'again' ? [...rest, head] : rest,
          reviewed: current.reviewed + 1,
        })
        return next
      })
    },
    [tableKey, cards],
  )

  const session = sessions.get(tableKey)

  return {
    current: session?.queue[0] ?? null,
    cardStates: cards,
    reviewedCount: session?.reviewed ?? 0,
    totalCount: (session?.reviewed ?? 0) + (session?.queue.length ?? 0),
    loading,
    persistError,
    grade,
  }
}
