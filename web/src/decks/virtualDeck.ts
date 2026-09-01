import type { EnrichedEntry } from '@teochew/core'
import type { Deck, DeckHue } from '@teochew/core'

/**
 * Not a real user id — no stored deck can ever collide with it (storage.ts
 * rejects any persisted deck claiming this id), so callers can use it as a
 * stable, hardcoded reference to "the whole dictionary."
 */
export const DICTIONARY_DECK_ID = 'dictionary'

const DICTIONARY_DECK_NAME = 'Dictionary'
const DICTIONARY_DECK_HUE: DeckHue = 'blue'

export function isVirtualDeckId(id: string): boolean {
  return id === DICTIONARY_DECK_ID
}

/**
 * The dictionary plays like any other deck but is never persisted: its
 * membership is exactly "every currently loaded entry", recomputed on every
 * call rather than stored, so it can't rot as the lexicon grows and doesn't
 * spend localStorage quota on 16,000+ ids that mean "all of them."
 */
export function makeDictionaryDeck(entries: EnrichedEntry[]): Deck {
  return {
    id: DICTIONARY_DECK_ID,
    name: DICTIONARY_DECK_NAME,
    hue: DICTIONARY_DECK_HUE,
    kind: 'virtual',
    cards: entries.map((e) => e.id),
  }
}
