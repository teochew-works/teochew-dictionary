import { DECK_HUES } from './types'
import type { DeckHue } from './types'

/** Cycles through the palette in a fixed, deterministic order — no randomness to keep tests and re-renders stable. */
export function nextHue(existingDeckCount: number): DeckHue {
  return DECK_HUES[existingDeckCount % DECK_HUES.length]!
}
