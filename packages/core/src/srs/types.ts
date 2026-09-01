export type Grade = 'again' | 'good' | 'easy'

/** Persisted per-card scheduling state (SM-2-style). Keyed by entry.id. */
export interface CardState {
  entryId: string
  /** SM-2 ease factor. Starts at 2.5, never drops below 1.3. */
  efactor: number
  /** Days until the card is next due. 0 for a never-reviewed card. */
  interval: number
  /** Consecutive non-"again" reviews. Resets to 0 on "again". */
  repetitions: number
  /** ISO 8601 timestamp the card becomes due. */
  dueAt: string
  /** ISO 8601 timestamp of the last review, or null if never reviewed. */
  lastReviewedAt: string | null
}

export interface QueueItem {
  entryId: string
  kind: 'due' | 'new'
}
