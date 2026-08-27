/**
 * Hand-written mirror of dist/sounds.json's shape. Source of truth lives in
 * the root project — keep this in sync by hand with `src/build/sounds.ts`.
 * See web/src/types/dict.ts's doc comment for why this is a duplicated type
 * rather than an import.
 */

export interface SoundExample {
  headword: string
  pengim: string
  gloss: string
}

/** A published recording of this sound, stripped down to what playback needs. */
export interface SoundClip {
  url: string
  speaker?: string
}

export interface Sound {
  pengim: string
  ipa: string
  /** Peng'im initial, or null for the zero initial (issue #171). */
  initial: string | null
  /** Peng'im rime — see `rimeOf` in the root project's src/phonology/ipa.ts. */
  rime: string
  tone: number
  /**
   * Dictionary-wide occurrence count: citation-form occurrences plus
   * tone-sandhi surface occurrences, summed. Distinct from a headword's
   * `frequency` (curriculum-commonness band) — this is a corpus-derived,
   * per-syllable raw count.
   */
  occurrences: number
  examples: SoundExample[]
  /** Every recorded clip for this syllable; empty when none exist yet. */
  clips: SoundClip[]
}

export interface SoundsData {
  variety: string
  sounds: Sound[]
}
