const SPEAKER_PREFERENCE_KEY = 'teochew-dictionary:speaker-preference'

// Existing behavior is no preference — an empty ranking falls back to the
// build's own default order (confidence, then recency, then whole-reading
// speaker consistency; see resolveReadingAudio/sortClipsByDefault) — no
// visual or playback change for anyone who never touches this (issue #274).
export const DEFAULT_SPEAKER_PREFERENCE: string[] = []

function isSpeakerPreference(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

export function readSpeakerPreference(): string[] {
  try {
    const stored = localStorage.getItem(SPEAKER_PREFERENCE_KEY)
    if (!stored) return DEFAULT_SPEAKER_PREFERENCE
    const parsed: unknown = JSON.parse(stored)
    return isSpeakerPreference(parsed) ? parsed : DEFAULT_SPEAKER_PREFERENCE
  } catch {
    return DEFAULT_SPEAKER_PREFERENCE
  }
}

export function writeSpeakerPreference(order: string[]): void {
  try {
    localStorage.setItem(SPEAKER_PREFERENCE_KEY, JSON.stringify(order))
  } catch {
    // localStorage unavailable — the ranking still applies this session, just doesn't persist.
  }
}
