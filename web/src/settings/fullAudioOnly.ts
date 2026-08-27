// Key predates this module (originally flashcards/audioFilter.ts) and is kept
// as-is rather than renamed, so existing users' stored preference survives
// the relocation into a shared setting (issue #173).
const FULL_AUDIO_ONLY_KEY = 'teochew-dictionary:flashcard-full-audio-only'

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
