/**
 * Hand-written mirror of dist/dict.json's shape. Source of truth lives in the
 * root project — keep this in sync by hand with:
 *   - src/schema/entry.ts     (Entry, Reading, Sense, Example, PartOfSpeech)
 *   - src/build/enrich.ts     (EnrichedEntry, EnrichedReading, AudioReference)
 *   - src/build/index.ts      (the { meta, entries } envelope)
 *
 * web/ is a separate npm project (own package.json, no access to root's
 * zod/better-sqlite3 deps), so this is a plain duplicated type rather than an
 * import — see the plan's rationale for issue #55.
 */

export type PartOfSpeech =
  | 'noun'
  | 'proper-noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'numeral'
  | 'classifier'
  | 'preposition'
  | 'conjunction'
  | 'particle'
  | 'interjection'
  | 'prefix'
  | 'suffix'
  | 'phrase'
  | 'idiom'

export type Confidence = 'high' | 'medium' | 'low'

export interface Example {
  hanzi: string
  pengim: string
  en: string
  note?: string
}

export interface Sense {
  pos: PartOfSpeech
  gloss_en: string[]
  gloss_zh?: string[]
  note?: string
  examples?: Example[]
}

export interface AudioReference {
  /** The `clips`/`wordClips` key this clip was resolved from, e.g. `dio5` or `bhi7 jui2`. */
  key: string
  url: string
  confidence: Confidence
  licence: string
  attributions: string[]
}

export interface EnrichedReading {
  pengim: string
  variety: string
  register?: 'colloquial' | 'literary' | 'both'
  ipa: string
  poj: string
  /** Peng'im respelled with surface (post-sandhi) tone numbers. */
  sandhi: string
  ipa_confidence: Confidence | 'override'
  ipa_caveats: string[]
  pengim_toneless: string
  syllable_count: number
  /** One slot per syllable; null where no clip has been recorded (out of scope for v1 UI). */
  audio: (AudioReference | null)[]
  /** Whole-word/phrase clip for this reading's exact pengim string, e.g. a Lingua Libre import (out of scope for v1 UI). */
  wordAudio: AudioReference | null
}

export interface EnrichedEntry {
  id: string
  headword: string
  variants?: string[]
  readings: EnrichedReading[]
  senses: Sense[]
  tags?: string[]
  frequency?: number
  sources: string[]
  retrieved?: string
  needs_review?: boolean
  hidden?: boolean
  /** Every string a user might reasonably type to find this entry. */
  search_keys: string[]
  licence: string
  attributions: string[]
}

export interface DictMetaVariety {
  id: string
  name: string
  inherits?: string
}

export interface DictMeta {
  generated_from: string
  entry_count: number
  reading_count: number
  varieties: DictMetaVariety[]
  sources: unknown[]
}

export interface Dict {
  meta: DictMeta
  entries: EnrichedEntry[]
}
