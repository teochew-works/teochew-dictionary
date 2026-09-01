export type PronunciationMode = 'citation' | 'sandhi'

export const DEFAULT_PRONUNCIATION_MODE: PronunciationMode = 'sandhi'

// New key, distinct from the old flashcard-only teochew-dictionary:flashcard-pronunciation:
// this setting now also drives Dictionary tab's tone-sort grouping and audio
// playback (issue #173), which previously defaulted to 'citation' — silently
// reinterpreting a flashcard user's stored 'citation' pick as a vote for
// Dictionary's default too would apply a choice they never made.
const PRONUNCIATION_MODE_KEY = 'teochew-dictionary:pronunciation-mode'

function isPronunciationMode(value: string | null): value is PronunciationMode {
  return value === 'citation' || value === 'sandhi'
}

export function readPronunciationMode(): PronunciationMode {
  try {
    const stored = localStorage.getItem(PRONUNCIATION_MODE_KEY)
    return isPronunciationMode(stored) ? stored : DEFAULT_PRONUNCIATION_MODE
  } catch {
    return DEFAULT_PRONUNCIATION_MODE
  }
}

export function writePronunciationMode(mode: PronunciationMode): void {
  try {
    localStorage.setItem(PRONUNCIATION_MODE_KEY, mode)
  } catch {
    // localStorage unavailable — mode still applies this session, just doesn't persist.
  }
}
