import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'

import { STARTER_DECKS_FILE } from '../paths.js'
import { starterDecksFileSchema, type StarterDecksFile } from '../schema/starter-decks.js'
import type { LoadedEntry } from '../data/load.js'

/**
 * Compiles `data/wordlists/starter-decks.yaml` (the marketplace catalog,
 * issue #199) into entry-id-resolved decks for `dist/starter-decks.json`.
 *
 * A catalog headword with no matching entry (or matching variant) in
 * `data/entries/` is dropped from its deck's `cards` and reported in
 * `unresolved`, never treated as a build error — the same tolerance the deck
 * model already applies to stale ids (see web/src/decks/pipeline.ts).
 * Resolving the gap means staging the headword through the importer
 * (ADR-0006) and merging it by hand; this build step only reports the gap.
 */

export interface BuiltStarterDeck {
  id: string
  name: string
  cards: string[]
}

export interface UnresolvedStarterItem {
  deckId: string
  headword: string
}

export interface StarterDecksResult {
  decks: BuiltStarterDeck[]
  unresolved: UnresolvedStarterItem[]
}

export function loadStarterDecksFile(): StarterDecksFile {
  const raw = parseYaml(readFileSync(STARTER_DECKS_FILE, 'utf8'))
  return starterDecksFileSchema.parse(raw)
}

export function buildStarterDecks(loaded: LoadedEntry[], file: StarterDecksFile = loadStarterDecksFile()): StarterDecksResult {
  const entryIdByHeadword = new Map<string, string>()
  for (const { entry } of loaded) {
    entryIdByHeadword.set(entry.headword, entry.id)
    for (const variant of entry.variants ?? []) entryIdByHeadword.set(variant, entry.id)
  }

  const decks: BuiltStarterDeck[] = []
  const unresolved: UnresolvedStarterItem[] = []

  for (const deck of file.decks) {
    const cards: string[] = []
    for (const item of deck.items) {
      const entryId = entryIdByHeadword.get(item.headword)
      if (entryId) cards.push(entryId)
      else unresolved.push({ deckId: deck.id, headword: item.headword })
    }
    decks.push({ id: deck.id, name: deck.name, cards })
  }

  return { decks, unresolved }
}
