const SHOW_LICENCE_KEY = 'teochew-dictionary:show-licence'

/**
 * Defaults to on: most entries are CC-BY-SA-4.0 (README's Licensing section),
 * and a hosted app that shares that material should surface attribution by
 * default rather than behind an opt-in a visitor has to find first. A stored
 * `'false'` (someone who explicitly turned it off) is still honoured.
 */
export function readShowLicence(): boolean {
  try {
    const stored = localStorage.getItem(SHOW_LICENCE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

export function writeShowLicence(value: boolean): void {
  try {
    localStorage.setItem(SHOW_LICENCE_KEY, String(value))
  } catch {
    // localStorage unavailable (e.g. private browsing) — toggle still works, just doesn't persist.
  }
}
