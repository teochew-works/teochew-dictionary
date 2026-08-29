import type { AudioReference, EnrichedEntry, EnrichedReading } from '../enrichedEntry.js'
import type { PronunciationMode } from '../settings/pronunciationMode.js'

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

/**
 * Whether `reading` qualifies for on-the-fly combined-audio synthesis
 * (issue #191): more than one syllable, every syllable clip present, and
 * every one of those clips from the same speaker — a mixed-speaker set could
 * splice together different voices, which sounds worse than not offering
 * combined playback at all. Deliberately doesn't consider `wordAudio` — a
 * natively-recorded whole-word clip is played directly instead of
 * synthesized (see ReadingAudio), so this only answers "can synthesis
 * happen". A clip with no `speaker` never counts toward a match — there's no
 * identity to compare, same convention as the build pipeline's
 * `bestCommonSpeaker` (src/build/enrich.ts).
 */
export function canCombine(reading: EnrichedReading, pronunciation: PronunciationMode = 'citation'): boolean {
  if (reading.syllable_count <= 1) return false
  const clips = pronunciation === 'sandhi' ? reading.sandhiAudio : reading.audio
  if (!clips.every((c): c is AudioReference => c !== null)) return false
  const speaker = clips[0]!.speaker
  return speaker !== undefined && clips.every((c) => c.speaker === speaker)
}

/**
 * The urls a combined clip would be synthesized from — also the cache/status
 * key `useCombinedClip` keys on. Only meaningful (and only ever called)
 * where `reading.wordAudio` is absent — a wordAudio-covered reading plays
 * that directly instead (see ReadingAudio), no synthesis involved.
 */
export function syllableClipUrls(reading: EnrichedReading, pronunciation: PronunciationMode = 'citation'): string[] {
  const clips = pronunciation === 'sandhi' ? reading.sandhiAudio : reading.audio
  return clips.filter((c): c is AudioReference => c !== null).map((c) => c.url)
}
