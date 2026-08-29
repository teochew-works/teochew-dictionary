import type { DecksState } from './storage'
import type { Deck, DeckGroup } from './types'

/**
 * Pure `DecksState -> DecksState` transitions, unit-testable without React
 * or localStorage — decks/useDecksStore.ts is the only caller, and persists
 * every result via writeDecksState.
 */

export function addDeck(state: DecksState, deck: Deck): DecksState {
  return { ...state, decks: [...state.decks, deck] }
}

export function renameDeck(state: DecksState, deckId: string, name: string): DecksState {
  return { ...state, decks: state.decks.map((d) => (d.id === deckId ? { ...d, name } : d)) }
}

/** Also drops the deck from `inPlay` and from every group, so nothing keeps referencing a deck that no longer exists. */
export function deleteDeck(state: DecksState, deckId: string): DecksState {
  return {
    decks: state.decks.filter((d) => d.id !== deckId),
    inPlay: state.inPlay.filter((id) => id !== deckId),
    groups: state.groups.map((g) => ({ ...g, deckIds: g.deckIds.filter((id) => id !== deckId) })),
  }
}

/** `orderedIds` reorders the existing decks; any id not present in `state.decks` is ignored. */
export function reorderDecks(state: DecksState, orderedIds: string[]): DecksState {
  const byId = new Map(state.decks.map((d) => [d.id, d]))
  const reordered = orderedIds.map((id) => byId.get(id)).filter((d): d is Deck => d !== undefined)
  return { ...state, decks: reordered }
}

export function addCardToDeck(state: DecksState, deckId: string, entryId: string): DecksState {
  return {
    ...state,
    decks: state.decks.map((d) => (d.id === deckId && !d.cards.includes(entryId) ? { ...d, cards: [...d.cards, entryId] } : d)),
  }
}

export function removeCardFromDeck(state: DecksState, deckId: string, entryId: string): DecksState {
  return {
    ...state,
    decks: state.decks.map((d) => (d.id === deckId ? { ...d, cards: d.cards.filter((id) => id !== entryId) } : d)),
  }
}

/**
 * Takes `entryId` out of one deck and puts it in another, as one transition —
 * so a move persists once and offers a single thing to undo, rather than
 * reading as a removal followed by an unrelated addition.
 *
 * A move onto the deck the card is already in is a no-op, as is a move whose
 * target already holds it (the card still leaves the source).
 */
export function moveCardBetweenDecks(state: DecksState, fromDeckId: string, toDeckId: string, entryId: string): DecksState {
  if (fromDeckId === toDeckId) return state
  return {
    ...state,
    decks: state.decks.map((d) => {
      if (d.id === fromDeckId) return { ...d, cards: d.cards.filter((id) => id !== entryId) }
      if (d.id === toDeckId && !d.cards.includes(entryId)) return { ...d, cards: [...d.cards, entryId] }
      return d
    }),
  }
}

export function setInPlay(state: DecksState, deckIds: string[]): DecksState {
  return { ...state, inPlay: deckIds }
}

export function addToPlay(state: DecksState, deckId: string): DecksState {
  return state.inPlay.includes(deckId) ? state : { ...state, inPlay: [...state.inPlay, deckId] }
}

export function removeFromPlay(state: DecksState, deckId: string): DecksState {
  return { ...state, inPlay: state.inPlay.filter((id) => id !== deckId) }
}

/**
 * Puts `deckId` in play at `index` (the end, if omitted), repositioning it
 * there if it's already in play. Used by rail-to-table drag/keyboard-move
 * (issue #189), where "drop on the table" always means "ends up at this
 * position" — unlike `addToPlay`'s simple append-if-absent.
 */
export function moveToPlay(state: DecksState, deckId: string, index?: number): DecksState {
  const withoutDeck = state.inPlay.filter((id) => id !== deckId)
  const clamped = index === undefined ? withoutDeck.length : Math.max(0, Math.min(index, withoutDeck.length))
  return { ...state, inPlay: [...withoutDeck.slice(0, clamped), deckId, ...withoutDeck.slice(clamped)] }
}

export function reorderPlay(state: DecksState, orderedIds: string[]): DecksState {
  return { ...state, inPlay: orderedIds }
}

/** Adds a new group, or replaces an existing one with the same id (re-saving a group under its own id). */
export function saveGroup(state: DecksState, group: DeckGroup): DecksState {
  const exists = state.groups.some((g) => g.id === group.id)
  return {
    ...state,
    groups: exists ? state.groups.map((g) => (g.id === group.id ? group : g)) : [...state.groups, group],
  }
}

export function deleteGroup(state: DecksState, groupId: string): DecksState {
  return { ...state, groups: state.groups.filter((g) => g.id !== groupId) }
}

/**
 * Replaces the table with the group's deck set, verbatim. A deck id the
 * group references that no longer exists resolves to nothing downstream
 * (decks/pipeline.ts skips unknown ids) rather than erroring — deleteDeck
 * already scrubs live groups when a deck is removed, so this only matters
 * for a hand-edited or stale localStorage blob.
 */
export function loadGroup(state: DecksState, groupId: string): DecksState {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return state
  return { ...state, inPlay: [...group.deckIds] }
}
