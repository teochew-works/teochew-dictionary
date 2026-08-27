const SHOW_LICENCE_KEY = 'teochew-dictionary:show-licence'

export function readShowLicence(): boolean {
  try {
    return localStorage.getItem(SHOW_LICENCE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeShowLicence(value: boolean): void {
  try {
    localStorage.setItem(SHOW_LICENCE_KEY, String(value))
  } catch {
    // localStorage unavailable (e.g. private browsing) — toggle still works, just doesn't persist.
  }
}
