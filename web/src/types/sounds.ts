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

export interface Sound {
  pengim: string
  ipa: string
  examples: SoundExample[]
}

export interface SoundsData {
  variety: string
  sounds: Sound[]
}
