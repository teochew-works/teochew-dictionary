/** Shared across every importer that fetches from a live site. */
export const IMPORTER_USER_AGENT = 'teochew-dictionary importer (github; contact via repo)'

/**
 * Importers never write to `data/entries/`.
 *
 * They emit *proposals* into `data/staging/`, which a human reviews and merges.
 * Two reasons, both learned the hard way by other lexicon projects:
 *
 *  1. Licence hygiene. Imported glosses carry their own licence (CC-BY-SA for
 *     Wiktionary and CC-CEDICT). Keeping them separable until a human accepts
 *     them means the provenance recorded on the entry is actually true.
 *  2. Quality. Automatic extraction of Teochew readings is unreliable enough
 *     that unattended merging would degrade a hand-curated dataset.
 */

export interface ProposedReading {
  pengim: string
  variety?: string
  register?: string
  note?: string
}

export interface ProposedSense {
  pos?: string
  gloss_en: string[]
  gloss_zh?: string[]
}

/** A suggested new entry, or a suggested addition to an existing one. */
export interface Proposal {
  /** Existing entry id when this augments one; absent for a wholly new entry. */
  target_id?: string
  headword: string
  readings?: ProposedReading[]
  senses?: ProposedSense[]
  source: string
  retrieved: string
  /** Why a human should look at this — ambiguity, low confidence, conflicts. */
  flags?: string[]
}

export interface ImportResult {
  source: string
  proposals: Proposal[]
  /** Headwords the importer looked for but could not resolve. */
  misses: string[]
  notes: string[]
}
