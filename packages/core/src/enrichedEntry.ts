import type { Entry, Reading } from './schema/entry.js'
import type { AudioClip, Confidence } from './schema/phonology.js'

/**
 * The canonical shape of a `dist/dict.json`/`dist/dict.sqlite` record — every
 * hand-written `Reading`/`Entry` (see `./schema/entry.ts`) enriched at build
 * time with derived forms (IPA, POJ, sandhi, search keys, licensing, resolved
 * audio). The actual computation that produces these lives in the root
 * project's `src/build/enrich.ts`, since it needs disk access (phonology
 * tables, sources.yaml) that a package a mobile app bundles can't have; these
 * three interfaces are declared here, not there, because they're the real
 * source of truth for the shape both `web/` and a future `mobile/` consume,
 * and duplicating them by hand (as `web/src/types/dict.ts` used to) is
 * exactly the drift ADR-0002 exists to retire.
 */

/**
 * An audio clip resolved for a reading — either one syllable (from `clips`)
 * or the reading's whole pengim string (from `wordClips`); `key` holds
 * whichever string it was looked up by.
 */
export interface AudioReference extends Pick<AudioClip, 'url' | 'confidence'> {
  /** The `clips`/`wordClips` key this clip was resolved from, e.g. `dio5` or `bhi7 jui2`. */
  key: string
  /**
   * Derived from the clip's `sources` against data/sources.yaml — see
   * ../data/licence.ts. Mirrors EnrichedEntry.licence; see its doc comment.
   */
  licence: string
  /** Notices owed in addition to `licence`. Mirrors EnrichedEntry.attributions. */
  attributions: string[]
}

export interface EnrichedReading extends Reading {
  ipa: string
  poj: string
  /** Peng'im respelled with surface (post-sandhi) tone numbers. */
  sandhi: string
  /** Confidence of the IPA derivation, or `override` when hand-supplied. */
  ipa_confidence: Confidence | 'override'
  ipa_caveats: string[]
  /** Peng'im with tone digits stripped — the forgiving search key. */
  pengim_toneless: string
  syllable_count: number
  /**
   * One entry per syllable, in order; `null` where no clip has been recorded
   * yet. Whole-syllable, not stitched from components — see
   * data/phonology/REVIEW.md § 11. No compositional fallback exists, unlike
   * `ipa`/`poj`: a syllable either has a recording or it doesn't.
   */
  audio: (AudioReference | null)[]
  /**
   * Same as `audio`, but keyed by each syllable's sandhi surface spelling
   * where a sandhi-specific clip has been recorded; falls back to the
   * citation clip at that index otherwise (issue #36 coverage is partial).
   */
  sandhiAudio: (AudioReference | null)[]
  /**
   * A whole-word/phrase clip for this reading's exact pengim string (e.g. a
   * Lingua Libre import), distinct from the per-syllable `audio` above —
   * see `Audio.wordClips` and data/phonology/REVIEW.md § 16. `null` when no
   * such clip exists, which is the common case: most readings only ever get
   * per-syllable coverage.
   */
  wordAudio: AudioReference | null
}

export interface EnrichedEntry extends Omit<Entry, 'readings'> {
  readings: EnrichedReading[]
  /** Every string a user might reasonably type to find this entry. */
  search_keys: string[]
  /**
   * Derived from `sources` against data/sources.yaml — see ../data/licence.ts.
   * Never hand-written: BASE_LICENCE unless a cited source is share-alike, in
   * which case that source's licence covers the whole entry.
   */
  licence: string
  /**
   * Notices owed in addition to `licence` — every cited source whose own
   * licence differs from BASE_LICENCE, e.g. Unicode-DFS-2016 via `unihan`.
   * A permissive source here does not change `licence`; it still has to be
   * credited. Never empty: an entry whose sources owe nobody else's notice
   * credits the project itself instead — see withProjectAttribution.
   */
  attributions: string[]
}
