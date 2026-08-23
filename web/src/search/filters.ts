import type { EnrichedEntry } from '../types/dict'

/**
 * Whether any reading on the entry has a recording — a whole-word clip or a
 * single recorded syllable both count, since either gives the user something
 * to play (see ReadingAudio).
 *
 * Returns false for every entry in the dataset today: `data/phonology/audio/
 * *.yaml` doesn't exist yet (issues #36/#37, and the #106 merge follow-on), so
 * the build resolves every slot to null. Callers that filter on this need to
 * say something useful about an empty result rather than assume a search
 * missed.
 */
export function hasAudio(entry: EnrichedEntry): boolean {
  return entry.readings.some((r) => r.wordAudio !== null || r.audio.some((clip) => clip !== null))
}
