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
 * Whether `reading` qualifies for combined playback — its syllable clips
 * chained back-to-back (issue #191): more than one syllable, every syllable
 * clip present, and every one of those clips from the same speaker — a
 * mixed-speaker set would splice different voices together, which sounds
 * worse than not offering combined playback at all. Deliberately doesn't
 * consider `wordAudio` — a natively-recorded whole-word clip is played
 * directly instead of chaining syllables (see ReadingAudio), so this only
 * answers "can the syllables be chained". A clip with no `speaker` never
 * counts toward a match — there's no identity to compare, same convention as
 * the build pipeline's `bestCommonSpeaker` (src/build/enrich.ts).
 */
export function canCombine(reading: EnrichedReading, pronunciation: PronunciationMode = 'citation'): boolean {
  if (reading.syllable_count <= 1) return false
  const clips = pronunciation === 'sandhi' ? reading.sandhiAudio : reading.audio
  if (!clips.every((c): c is AudioReference => c !== null)) return false
  const speaker = clips[0]!.speaker
  return speaker !== undefined && clips.every((c) => c.speaker === speaker)
}

/**
 * A clip's playback url, with its precomputed silence boundaries (issue #252)
 * applied as an HTML5 Media Fragments URI (`#t=start,end`) — trims leading
 * and/or trailing dead air using only native `<audio>` seeking, so it works
 * on cross-origin GitHub Release assets without needing CORS-enabled hosting
 * (see ADR-0026). Returns the bare url unchanged when neither boundary has
 * been computed yet.
 */
export function withTrim(clip: AudioReference): string {
  if (clip.trimStartMs === undefined && clip.trimEndMs === undefined) return clip.url
  const start = (clip.trimStartMs ?? 0) / 1000
  const end = clip.trimEndMs === undefined ? '' : `,${clip.trimEndMs / 1000}`
  return `${clip.url}#t=${start}${end}`
}

/**
 * The clips a combined clip is chained from, in order. Only meaningful (and
 * only ever called) where `reading.wordAudio` is absent — a wordAudio-covered
 * reading plays that directly instead (see ReadingAudio). Returns the raw
 * `AudioReference`s rather than urls — crossfaded combined playback (issue
 * #252 phase 2) needs each clip's own `trimStartMs`/`trimEndMs` to schedule
 * the seam, not just its playback url.
 */
export function syllableClips(reading: EnrichedReading, pronunciation: PronunciationMode = 'citation'): AudioReference[] {
  const clips = pronunciation === 'sandhi' ? reading.sandhiAudio : reading.audio
  return clips.filter((c): c is AudioReference => c !== null)
}

/** `syllableClips`, each mapped through `withTrim` to its (possibly fragment-suffixed) playback url. */
export function syllableClipUrls(reading: EnrichedReading, pronunciation: PronunciationMode = 'citation'): string[] {
  return syllableClips(reading, pronunciation).map(withTrim)
}
