const MOGHER_LINKS_KEY = 'teochew-dictionary:mogher-links'

export function readMogherLinks(): boolean {
  try {
    return localStorage.getItem(MOGHER_LINKS_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeMogherLinks(value: boolean): void {
  try {
    localStorage.setItem(MOGHER_LINKS_KEY, String(value))
  } catch {
    // localStorage unavailable (e.g. private browsing) — toggle still works, just doesn't persist.
  }
}
