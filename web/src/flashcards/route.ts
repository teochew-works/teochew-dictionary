/** What the bottom dock is showing: nothing, the dictionary, one deck's cards, or the starter-deck marketplace. */
export type FlashcardsDrawer = { mode: 'dictionary' } | { mode: 'deck'; deckId: string } | { mode: 'marketplace' } | null

/** Parses the part of the hash after `flashcards/` (or `''` if there was none). */
export function parseFlashcardsDrawer(rest: string): FlashcardsDrawer {
  const slash = rest.indexOf('/')
  const mode = slash === -1 ? rest : rest.slice(0, slash)
  const arg = slash === -1 ? '' : rest.slice(slash + 1)
  if (mode === 'marketplace') return { mode: 'marketplace' }
  if (mode === 'dictionary') return { mode: 'dictionary' }
  if (mode === 'deck' && arg) return { mode: 'deck', deckId: decodeURIComponent(arg) }
  return null
}

/** Formats a `FlashcardsDrawer` back into the part of the hash after `flashcards/`. Closed (the default) has no suffix. */
export function formatFlashcardsDrawer(drawer: FlashcardsDrawer): string {
  switch (drawer?.mode) {
    case 'marketplace':
      return 'flashcards/marketplace'
    case 'deck':
      return `flashcards/deck/${encodeURIComponent(drawer.deckId)}`
    case 'dictionary':
      return 'flashcards/dictionary'
    default:
      return 'flashcards'
  }
}

