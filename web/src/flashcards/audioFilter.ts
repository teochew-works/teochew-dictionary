import type { EnrichedEntry } from '../types/dict'

const FULL_AUDIO_ONLY_KEY = 'teochew-dictionary:flashcard-full-audio-only'

/**
 * Whether `readings[0]` is *fully* recorded — every syllable has a clip, or
 * there's a whole-word clip. Scoped to `readings[0]` only, like
 * `isEligibleForMode`'s audio-only case, since Flashcard only ever displays
 * that reading. Stricter than `hasAudio` in `search/filters.ts`, which checks
 * "any clip on any reading" for the dictionary-search audio filter.
 */
export function hasFullAudio(entry: EnrichedEntry): boolean {
  const r = entry.readings[0]
  return r !== undefined && (r.wordAudio !== null || r.audio.every((c) => c !== null))
}

export function readFullAudioOnly(): boolean {
  try {
    return localStorage.getItem(FULL_AUDIO_ONLY_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeFullAudioOnly(value: boolean): void {
  try {
    localStorage.setItem(FULL_AUDIO_ONLY_KEY, String(value))
  } catch {
    // localStorage unavailable — choice still applies this session, just doesn't persist.
  }
}
