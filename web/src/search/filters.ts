import type { EnrichedEntry } from '../types/dict'

/**
 * Whether any reading on the entry has a recording — a whole-word clip or a
 * single recorded syllable both count, since either gives the user something
 * to play (see ReadingAudio).
 *
 * Returns false for most entries today: recorded coverage
 * (`data/phonology/audio/chaozhou.yaml`) is real but partial, and
 * Shantou/Chaoyang have no clips yet (issues #37, #106). Callers that filter
 * on this need to say something useful about an empty result rather than
 * assume a search missed.
 */
export function hasAudio(entry: EnrichedEntry): boolean {
  return entry.readings.some((r) => r.wordAudio !== null || r.audio.some((clip) => clip !== null))
}

/**
 * Whether `readings[0]` is *fully* recorded — every syllable has a clip, or
 * there's a whole-word clip. Scoped to `readings[0]` only, since Flashcard
 * and EntryRow (Dictionary's search-result rows) only ever display that
 * reading. Stricter than `hasAudio` above, which checks "any clip on any
 * reading".
 */
export function hasFullAudio(entry: EnrichedEntry): boolean {
  const r = entry.readings[0]
  return r !== undefined && (r.wordAudio !== null || r.audio.every((c) => c !== null))
}
