const SPEAK_TO_SEARCH_KEY = 'teochew-dictionary:speak-to-search'

/**
 * Off by default (issue #279's web follow-up): the mic button matches a
 * recording against a fixed, single-speaker (jky) reference bank, not
 * general speech recognition, so it's an opt-in experiment rather than a
 * feature every visitor sees by default.
 */
export function readSpeakToSearch(): boolean {
  try {
    return localStorage.getItem(SPEAK_TO_SEARCH_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeSpeakToSearch(value: boolean): void {
  try {
    localStorage.setItem(SPEAK_TO_SEARCH_KEY, String(value))
  } catch {
    // localStorage unavailable (e.g. private browsing) — toggle still works, just doesn't persist.
  }
}
