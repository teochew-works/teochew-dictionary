/**
 * A deck's colour slot, so it reads the same swatch in the library rail and
 * on the table rather than being recoloured per-render.
 */
export type DeckHue = 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'purple' | 'pink'

export const DECK_HUES: readonly DeckHue[] = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink']

export type DeckKind = 'user' | 'virtual'

export interface Deck {
  id: string
  name: string
  hue: DeckHue
  /** Entry ids, in the order they were added. */
  cards: string[]
  /**
   * 'virtual' decks (currently just the dictionary) are synthesised at read
   * time from the loaded entries rather than stored, and reject membership
   * edits — see decks/virtualDeck.ts.
   */
  kind: DeckKind
}

/** A named, saved set of deck ids — "the table" as it was when saved. */
export interface DeckGroup {
  id: string
  name: string
  deckIds: string[]
}
