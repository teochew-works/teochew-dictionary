/**
 * Hand-written mirror of dist/starter-decks.json's shape. Source of truth
 * lives in the root project — keep this in sync by hand with
 * `src/build/starter-decks.ts`. See web/src/types/dict.ts's doc comment for
 * why this is a duplicated type rather than an import.
 */

/** A marketplace catalog entry — not a Deck: no hue/kind until installed. */
export interface StarterDeckCatalogEntry {
  id: string
  name: string
  /** Resolved entry ids only — headwords with no current entry are already dropped at build time. */
  cards: string[]
}

export interface StarterDecksCatalog {
  decks: StarterDeckCatalogEntry[]
}
