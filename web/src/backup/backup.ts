import { isDecksState, readDecksState, writeDecksState } from '../decks/storage'
import type { DecksState } from '../decks/storage'
import { clearAllCards, getAllCards, putAllCards } from '../srs/db'
import type { CardState } from '@teochew/core'

/**
 * A JSON export of everything a review history is: the decks (localStorage)
 * and the SRS card states (IndexedDB). Both are script-writable storage, and
 * Safari's ITP deletes all of it after 7 days without a visit — installing to
 * the home screen is exempt, but that isn't something the app can guarantee,
 * so this is the insurance underneath it (mobile.md §4). It's also the only
 * way to move a review history to a different browser or device at all.
 */
export interface BackupFile {
  app: 'teochew-dictionary'
  kind: 'backup'
  /** Bumped on any incompatible change to either shape below. */
  version: 1
  exportedAt: string
  decks: DecksState
  cards: CardState[]
}

const CARD_FIELDS: (keyof CardState)[] = ['entryId', 'efactor', 'interval', 'repetitions', 'dueAt', 'lastReviewedAt']

function isCardState(value: unknown): value is CardState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.entryId === 'string' &&
    typeof v.efactor === 'number' &&
    typeof v.interval === 'number' &&
    typeof v.repetitions === 'number' &&
    typeof v.dueAt === 'string' &&
    (v.lastReviewedAt === null || typeof v.lastReviewedAt === 'string') &&
    // Rejects a card object carrying extra, unrecognised fields — more likely
    // a shape from a future version of this app than one this version wrote.
    Object.keys(v).every((k) => CARD_FIELDS.includes(k as keyof CardState))
  )
}

function isBackupFile(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    v.app === 'teochew-dictionary' &&
    v.kind === 'backup' &&
    v.version === 1 &&
    typeof v.exportedAt === 'string' &&
    isDecksState(v.decks) &&
    Array.isArray(v.cards) &&
    v.cards.every(isCardState)
  )
}

export async function buildBackup(): Promise<BackupFile> {
  const cards = await getAllCards()
  return {
    app: 'teochew-dictionary',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    decks: readDecksState(),
    cards: [...cards.values()],
  }
}

export type RestoreResult = { ok: true; deckCount: number; cardCount: number } | { ok: false; error: string }

/**
 * Replaces the current decks and review history with what the backup holds —
 * a restore, not a merge. Merging two independently-reviewed sets of SRS
 * state would mean picking a winner per card with no principled way to do
 * it; a clean replace is at least a choice the person made on purpose by
 * picking this file.
 */
export async function restoreBackup(parsed: unknown): Promise<RestoreResult> {
  if (!isBackupFile(parsed)) {
    return { ok: false, error: "That file doesn't look like a Teochew Dictionary backup." }
  }
  writeDecksState(parsed.decks)
  await clearAllCards()
  await putAllCards(parsed.cards)
  return { ok: true, deckCount: parsed.decks.decks.length, cardCount: parsed.cards.length }
}
