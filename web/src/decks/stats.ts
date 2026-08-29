import type { EnrichedEntry } from '../types/dict'
import type { CardState } from '../srs/types'
import type { Deck } from './types'
import { isEligibleForMode } from '../flashcards/promptMode'
import type { PromptMode } from '../flashcards/promptMode'
import { isEligibleForLevel } from '../flashcards/levelFilter'
import type { LevelFilterValue } from '../flashcards/levelFilter'
import { hasFullAudio } from '../search/filters'

/**
 * Per-deck counts for the library rail and the table (issue #189's
 * prototype parity pass): how big the deck is, how much of it survives the
 * session's filters, and how that surviving slice splits between due, new,
 * and already-learned.
 *
 * Kept pure and React-free like decks/pipeline.ts — the same filter
 * predicate runs here and there, so a deck's "slice that survived" can
 * never disagree with the funnel it feeds.
 */
export interface DeckStats {
  /** Cards in the deck, before any filtering. */
  total: number
  /** Cards that survive the prompt-mode, level, and audio filters. */
  kept: number
  /** Of `kept`: reviewed before and due now or earlier. */
  due: number
  /** Of `kept`: never reviewed. */
  fresh: number
  /** Of `kept`: reviewed and not due yet. */
  learned: number
}

export interface DeckFilters {
  mode: PromptMode
  levelFilter: Set<LevelFilterValue>
  fullAudioOnly: boolean
}

/**
 * The session's filter stack as a single predicate. Exported so
 * decks/pipeline.ts's stage-by-stage narrowing and this module's per-deck
 * counts stay definitionally the same filter rather than two copies that
 * can drift.
 */
export function passesFilters(entry: EnrichedEntry, filters: DeckFilters): boolean {
  return (
    isEligibleForMode(entry, filters.mode) &&
    isEligibleForLevel(entry, filters.levelFilter) &&
    (!filters.fullAudioOnly || hasFullAudio(entry))
  )
}

export function deckStats(
  deck: Deck,
  entryById: Map<string, EnrichedEntry>,
  cardStates: Map<string, CardState>,
  filters: DeckFilters,
  now = new Date(),
): DeckStats {
  let kept = 0
  let due = 0
  let fresh = 0
  let learned = 0

  for (const cardId of deck.cards) {
    const entry = entryById.get(cardId)
    if (!entry || !passesFilters(entry, filters)) continue
    kept += 1

    const state = cardStates.get(cardId)
    if (!state) fresh += 1
    else if (new Date(state.dueAt) <= now) due += 1
    else learned += 1
  }

  return { total: deck.cards.length, kept, due, fresh, learned }
}

/**
 * What the table's chip says under a deck's name. "all in play" rather than
 * a count when nothing was filtered out, so the label only draws the eye
 * when the filters actually bit into that deck.
 */
export function sliceLabel(stats: DeckStats): string {
  if (stats.kept === stats.total) return 'all in play'
  return `${stats.kept.toLocaleString()} of ${stats.total.toLocaleString()} pass filters`
}
