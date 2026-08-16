import { useCallback, useEffect, useRef, useState } from 'react'
import { getAllCards, putCard } from './db'
import { buildQueue, gradeCard, newCardState } from './scheduler'
import type { CardState, Grade, QueueItem } from './types'
import type { EnrichedEntry } from '../types/dict'

export interface SrsQueueState {
  current: QueueItem | null
  reviewedCount: number
  totalCount: number
  loading: boolean
  /** Set when IndexedDB read/write fails (e.g. locked-down private browsing) — review still works, just isn't saved. */
  persistError: string | null
  grade: (grade: Grade) => void
}

/**
 * Wires the pure scheduler (scheduler.ts) and the IndexedDB store (db.ts)
 * into a React-friendly review queue. Grading "again" re-appends the card to
 * the in-memory session queue so it resurfaces later in the same session,
 * while the persisted CardState is written immediately with interval: 1 —
 * so a reload mid-session still finds it due again tomorrow, not today.
 */
export function useSrsQueue(entries: EnrichedEntry[]): SrsQueueState {
  const [cards, setCards] = useState<Map<string, CardState>>(new Map())
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [reviewedCount, setReviewedCount] = useState(0)
  const totalCountRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    getAllCards()
      .then((loaded) => {
        if (cancelled) return
        setCards(loaded)
        const built = buildQueue(entries, loaded)
        totalCountRef.current = built.length
        setQueue(built)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const built = buildQueue(entries, new Map())
        totalCountRef.current = built.length
        setQueue(built)
        setLoading(false)
        setPersistError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [entries])

  const grade = useCallback(
    (g: Grade) => {
      setQueue((prevQueue) => {
        const [head, ...rest] = prevQueue
        if (!head) return prevQueue

        const priorState = cards.get(head.entryId) ?? newCardState(head.entryId)
        const nextState = gradeCard(priorState, g)

        setCards((prev) => new Map(prev).set(head.entryId, nextState))
        setReviewedCount((n) => n + 1)

        putCard(nextState).catch((err: unknown) => {
          setPersistError(err instanceof Error ? err.message : String(err))
        })

        return g === 'again' ? [...rest, head] : rest
      })
    },
    [cards],
  )

  return {
    current: queue[0] ?? null,
    reviewedCount,
    totalCount: totalCountRef.current,
    loading,
    persistError,
    grade,
  }
}
