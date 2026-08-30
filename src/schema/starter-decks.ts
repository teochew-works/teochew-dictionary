import { z } from 'zod'

/**
 * Schema for `data/wordlists/starter-decks.yaml` — the hand-curated marketplace
 * catalog of themed beginner decks (issue #199). Unlike the syllable inventory
 * (100% mechanically derivable, see inventory.ts), deck membership is an
 * editorial choice and stays hand-maintained; what *is* derived, and so isn't
 * stored here, is each headword's resolution to a current entry id — that
 * happens at build time (src/build/starter-decks.ts).
 */

export const starterDeckItemSchema = z.object({
  /** Chosen written-Chinese headword, matched against data/entries/ at build time. */
  headword: z.string().min(1),
  gloss: z.string().min(1),
  /** Free-form review flag: an alternate headword, a linguistic risk, why this word was chosen. */
  note: z.string().min(1).optional(),
})

export const starterDeckSchema = z.object({
  /** Lowercase-hyphen catalog slug, stable across builds — not a Deck.id (those are minted at install time). */
  id: z.string().regex(/^[a-z0-9-]+$/u, 'id must be lowercase, hyphen-separated'),
  name: z.string().min(1),
  note: z.string().min(1).optional(),
  items: z.array(starterDeckItemSchema).min(1),
})

export const starterDecksFileSchema = z.object({
  decks: z.array(starterDeckSchema).min(1),
})

export type StarterDeckItem = z.infer<typeof starterDeckItemSchema>
export type StarterDeck = z.infer<typeof starterDeckSchema>
export type StarterDecksFile = z.infer<typeof starterDecksFileSchema>
