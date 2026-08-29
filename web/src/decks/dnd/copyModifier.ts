/**
 * Dragging a card out of a deck moves it; holding the platform's copy
 * modifier makes it a copy instead. Which key that is follows the OS
 * convention rather than the app inventing one — Option on macOS, Control
 * everywhere else, matching Finder and File Explorer.
 *
 * Kept pure and passed the platform, so both branches are testable without
 * touching `navigator`.
 */
export function isCopyModifier(event: { altKey: boolean; ctrlKey: boolean }, mac: boolean): boolean {
  return mac ? event.altKey : event.ctrlKey
}

export function isMacPlatform(userAgent: string = navigator.userAgent): boolean {
  return /Mac|iPhone|iPad|iPod/.test(userAgent)
}

/** How to name the modifier in a hint, in the reader's own platform's terms. */
export function copyModifierName(mac: boolean = isMacPlatform()): string {
  return mac ? '⌥' : 'Ctrl'
}
