import type { Deck, DeckGroup, DeckHue } from './types'
import { DECK_HUES } from './types'
import { DICTIONARY_DECK_ID } from './virtualDeck'

export interface DecksState {
  /** User-created decks only — the virtual dictionary deck is never stored. */
  decks: Deck[]
  /** Ordered deck ids currently on the table. */
  inPlay: string[]
  groups: DeckGroup[]
}

// Versioned (v1) rather than a bare key, so a future incompatible shape
// change can read the old key for a one-time migration instead of guessing
// at a mixed-version blob.
const DECKS_STATE_KEY = 'teochew-dictionary:decks/v1'

export function defaultDecksState(): DecksState {
  return { decks: [], inPlay: [DICTIONARY_DECK_ID], groups: [] }
}

function isDeckHue(value: unknown): value is DeckHue {
  return typeof value === 'string' && (DECK_HUES as readonly string[]).includes(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

// Only ever validates *stored* decks, which must be 'user' decks with an id
// distinct from the virtual dictionary deck — a blob claiming otherwise is
// corrupt (or hand-edited), not a deck we should trust.
function isStoredDeck(value: unknown): value is Deck {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    v.id !== DICTIONARY_DECK_ID &&
    typeof v.name === 'string' &&
    isDeckHue(v.hue) &&
    isStringArray(v.cards) &&
    v.kind === 'user'
  )
}

function isDeckGroup(value: unknown): value is DeckGroup {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.name === 'string' && isStringArray(v.deckIds)
}

function isDecksState(value: unknown): value is DecksState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.decks) &&
    v.decks.every(isStoredDeck) &&
    isStringArray(v.inPlay) &&
    Array.isArray(v.groups) &&
    v.groups.every(isDeckGroup)
  )
}

/**
 * Structural validation only — this does not check that `inPlay`/`groups`
 * reference decks that still exist, or that a deck's `cards` still exist in
 * the dictionary. Both are resolved against live data at read time by
 * decks/pipeline.ts instead, so a deleted deck or a rebuilt lexicon isn't
 * treated as corruption here.
 */
export function readDecksState(): DecksState {
  try {
    const stored = localStorage.getItem(DECKS_STATE_KEY)
    if (stored === null) return defaultDecksState()
    const parsed: unknown = JSON.parse(stored)
    return isDecksState(parsed) ? parsed : defaultDecksState()
  } catch {
    return defaultDecksState()
  }
}

export function writeDecksState(state: DecksState): void {
  try {
    localStorage.setItem(DECKS_STATE_KEY, JSON.stringify(state))
  } catch {
    // localStorage unavailable — state still applies this session, just doesn't persist.
  }
}
