const AUDIO_ONLY_KEY = 'teochew-dictionary:audio-only'

export function readAudioOnly(): boolean {
  try {
    return localStorage.getItem(AUDIO_ONLY_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeAudioOnly(value: boolean): void {
  try {
    localStorage.setItem(AUDIO_ONLY_KEY, String(value))
  } catch {
    // localStorage unavailable (e.g. private browsing) — toggle still works, just doesn't persist.
  }
}
