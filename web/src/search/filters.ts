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
