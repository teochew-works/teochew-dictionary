import { useCallback, useState } from 'react'
import * as actions from './actions'
import { generateDeckId, generateGroupId } from './id'
import { nextHue } from './hue'
import { readDecksState, writeDecksState } from './storage'
import type { DecksState } from './storage'

export interface DecksStore {
  state: DecksState
  /** Returns the new deck's id, so the caller can put it straight into inline rename. */
  createDeck: (name: string, cards?: string[]) => string
  duplicateDeck: (deckId: string) => void
  renameDeck: (deckId: string, name: string) => void
  deleteDeck: (deckId: string) => void
  reorderDecks: (orderedIds: string[]) => void
  addCardToDeck: (deckId: string, entryId: string) => void
  removeCardFromDeck: (deckId: string, entryId: string) => void
  moveCardBetweenDecks: (fromDeckId: string, toDeckId: string, entryId: string) => void
  setInPlay: (deckIds: string[]) => void
  addToPlay: (deckId: string) => void
  removeFromPlay: (deckId: string) => void
  moveToPlay: (deckId: string, index?: number) => void
  reorderPlay: (orderedIds: string[]) => void
  saveGroup: (name: string, deckIds: string[]) => void
  deleteGroup: (groupId: string) => void
  loadGroup: (groupId: string) => void
  /**
   * Puts the whole state back, verbatim. Backs the undo offered on
   * destructive actions (deleting a deck, clearing the table): the caller
   * snapshots `state` before the change and hands that snapshot back here.
   */
  restore: (state: DecksState) => void
}

/**
 * The single source of truth for deck state in the running app: holds
 * `DecksState` in React state (initialised from localStorage) and persists
 * every mutation back via writeDecksState. Each method below just applies
 * the matching pure transition from actions.ts, so the transition logic
 * itself stays testable without React.
 */
export function useDecksStore(): DecksStore {
  const [state, setState] = useState<DecksState>(readDecksState)

  const update = useCallback((fn: (s: DecksState) => DecksState) => {
    setState((prev) => {
      const next = fn(prev)
      writeDecksState(next)
      return next
    })
  }, [])

  return {
    state,
    createDeck: useCallback(
      (name: string, cards: string[] = []) => {
        const id = generateDeckId()
        update((s) => actions.addDeck(s, { id, name, hue: nextHue(s.decks.length), cards, kind: 'user' }))
        return id
      },
      [update],
    ),
    duplicateDeck: useCallback(
      (deckId: string) =>
        update((s) => {
          const source = s.decks.find((d) => d.id === deckId)
          if (!source) return s
          return actions.addDeck(s, {
            id: generateDeckId(),
            name: `${source.name} copy`,
            hue: nextHue(s.decks.length),
            cards: [...source.cards],
            kind: 'user',
          })
        }),
      [update],
    ),
    renameDeck: useCallback((deckId: string, name: string) => update((s) => actions.renameDeck(s, deckId, name)), [update]),
    deleteDeck: useCallback((deckId: string) => update((s) => actions.deleteDeck(s, deckId)), [update]),
    reorderDecks: useCallback((orderedIds: string[]) => update((s) => actions.reorderDecks(s, orderedIds)), [update]),
    addCardToDeck: useCallback(
      (deckId: string, entryId: string) => update((s) => actions.addCardToDeck(s, deckId, entryId)),
      [update],
    ),
    removeCardFromDeck: useCallback(
      (deckId: string, entryId: string) => update((s) => actions.removeCardFromDeck(s, deckId, entryId)),
      [update],
    ),
    moveCardBetweenDecks: useCallback(
      (fromDeckId: string, toDeckId: string, entryId: string) =>
        update((s) => actions.moveCardBetweenDecks(s, fromDeckId, toDeckId, entryId)),
      [update],
    ),
    setInPlay: useCallback((deckIds: string[]) => update((s) => actions.setInPlay(s, deckIds)), [update]),
    addToPlay: useCallback((deckId: string) => update((s) => actions.addToPlay(s, deckId)), [update]),
    removeFromPlay: useCallback((deckId: string) => update((s) => actions.removeFromPlay(s, deckId)), [update]),
    moveToPlay: useCallback((deckId: string, index?: number) => update((s) => actions.moveToPlay(s, deckId, index)), [update]),
    reorderPlay: useCallback((orderedIds: string[]) => update((s) => actions.reorderPlay(s, orderedIds)), [update]),
    saveGroup: useCallback(
      (name: string, deckIds: string[]) => update((s) => actions.saveGroup(s, { id: generateGroupId(), name, deckIds })),
      [update],
    ),
    deleteGroup: useCallback((groupId: string) => update((s) => actions.deleteGroup(s, groupId)), [update]),
    loadGroup: useCallback((groupId: string) => update((s) => actions.loadGroup(s, groupId)), [update]),
    restore: useCallback((snapshot: DecksState) => update(() => snapshot), [update]),
  }
}
