import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDecksStore } from './useDecksStore'
import { readDecksState } from './storage'
import { DICTIONARY_DECK_ID } from './virtualDeck'

describe('useDecksStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initialises from persisted state', () => {
    const { result } = renderHook(() => useDecksStore())
    expect(result.current.state.inPlay).toEqual([DICTIONARY_DECK_ID])
  })

  it('createDeck adds a user deck and persists it', () => {
    const { result } = renderHook(() => useDecksStore())

    act(() => result.current.createDeck('Kitchen'))

    expect(result.current.state.decks).toHaveLength(1)
    expect(result.current.state.decks[0]!.name).toBe('Kitchen')
    expect(result.current.state.decks[0]!.kind).toBe('user')
    expect(readDecksState().decks[0]!.name).toBe('Kitchen')
  })

  it('createDeck assigns distinct ids to successive decks', () => {
    const { result } = renderHook(() => useDecksStore())

    act(() => {
      result.current.createDeck('One')
      result.current.createDeck('Two')
    })

    const ids = result.current.state.decks.map((d) => d.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('renameDeck updates the persisted name', () => {
    const { result } = renderHook(() => useDecksStore())
    act(() => result.current.createDeck('Old'))
    const id = result.current.state.decks[0]!.id

    act(() => result.current.renameDeck(id, 'New'))

    expect(result.current.state.decks[0]!.name).toBe('New')
    expect(readDecksState().decks[0]!.name).toBe('New')
  })

  it('deleteDeck removes the deck and takes it off the table', () => {
    const { result } = renderHook(() => useDecksStore())
    act(() => result.current.createDeck('Kitchen'))
    const id = result.current.state.decks[0]!.id
    act(() => result.current.addToPlay(id))

    act(() => result.current.deleteDeck(id))

    expect(result.current.state.decks).toEqual([])
    expect(result.current.state.inPlay).not.toContain(id)
  })

  it('addCardToDeck / removeCardFromDeck round-trip through persistence', () => {
    const { result } = renderHook(() => useDecksStore())
    act(() => result.current.createDeck('Kitchen'))
    const id = result.current.state.decks[0]!.id

    act(() => result.current.addCardToDeck(id, 'entry-1'))
    expect(result.current.state.decks[0]!.cards).toEqual(['entry-1'])
    expect(readDecksState().decks[0]!.cards).toEqual(['entry-1'])

    act(() => result.current.removeCardFromDeck(id, 'entry-1'))
    expect(result.current.state.decks[0]!.cards).toEqual([])
  })

  it('addToPlay / removeFromPlay manage the table', () => {
    const { result } = renderHook(() => useDecksStore())
    act(() => result.current.createDeck('Kitchen'))
    const id = result.current.state.decks[0]!.id

    act(() => result.current.addToPlay(id))
    expect(result.current.state.inPlay).toEqual([DICTIONARY_DECK_ID, id])

    act(() => result.current.removeFromPlay(id))
    expect(result.current.state.inPlay).toEqual([DICTIONARY_DECK_ID])
  })

  it('saveGroup then loadGroup round-trips the table', () => {
    const { result } = renderHook(() => useDecksStore())
    act(() => result.current.createDeck('Kitchen'))
    const id = result.current.state.decks[0]!.id
    act(() => result.current.setInPlay([DICTIONARY_DECK_ID, id]))

    act(() => result.current.saveGroup('Evenings', result.current.state.inPlay))
    const groupId = result.current.state.groups[0]!.id

    act(() => result.current.setInPlay([]))
    act(() => result.current.loadGroup(groupId))

    expect(result.current.state.inPlay).toEqual([DICTIONARY_DECK_ID, id])
  })

  it('deleteGroup removes a saved group', () => {
    const { result } = renderHook(() => useDecksStore())
    act(() => result.current.saveGroup('Evenings', [DICTIONARY_DECK_ID]))
    const groupId = result.current.state.groups[0]!.id

    act(() => result.current.deleteGroup(groupId))

    expect(result.current.state.groups).toEqual([])
  })

  describe('issue #189 additions', () => {
    it('returns the new deck id, so the caller can name it in place', () => {
      const { result } = renderHook(() => useDecksStore())
      let id = ''
      act(() => {
        id = result.current.createDeck('Kitchen')
      })
      expect(result.current.state.decks.map((d) => d.id)).toEqual([id])
    })

    it('creates a deck already holding cards', () => {
      const { result } = renderHook(() => useDecksStore())
      act(() => {
        result.current.createDeck('Pool', ['a', 'b'])
      })
      expect(result.current.state.decks[0]!.cards).toEqual(['a', 'b'])
    })

    it('duplicates a deck under its own id, copying the cards', () => {
      const { result } = renderHook(() => useDecksStore())
      act(() => {
        result.current.createDeck('Kitchen', ['a'])
      })
      const original = result.current.state.decks[0]!
      act(() => result.current.duplicateDeck(original.id))

      const [first, copy] = result.current.state.decks
      expect(copy!.name).toBe('Kitchen copy')
      expect(copy!.cards).toEqual(['a'])
      expect(copy!.id).not.toBe(first!.id)
    })

    it('copies the cards rather than sharing the array', () => {
      const { result } = renderHook(() => useDecksStore())
      act(() => {
        result.current.createDeck('Kitchen', ['a'])
      })
      act(() => result.current.duplicateDeck(result.current.state.decks[0]!.id))
      act(() => result.current.addCardToDeck(result.current.state.decks[1]!.id, 'b'))

      expect(result.current.state.decks[0]!.cards).toEqual(['a'])
      expect(result.current.state.decks[1]!.cards).toEqual(['a', 'b'])
    })

    it('ignores a duplicate of a deck that no longer exists', () => {
      const { result } = renderHook(() => useDecksStore())
      act(() => result.current.duplicateDeck('gone'))
      expect(result.current.state.decks).toEqual([])
    })

    it('restores a whole snapshot, which is what backs Undo', () => {
      const { result } = renderHook(() => useDecksStore())
      act(() => {
        result.current.createDeck('Kitchen', ['a'])
      })
      const snapshot = result.current.state
      act(() => result.current.deleteDeck(snapshot.decks[0]!.id))
      expect(result.current.state.decks).toEqual([])

      act(() => result.current.restore(snapshot))
      expect(result.current.state).toEqual(snapshot)
    })

    it('persists a restore, so a reload agrees with what Undo put back', () => {
      const { result } = renderHook(() => useDecksStore())
      act(() => {
        result.current.createDeck('Kitchen', ['a'])
      })
      const snapshot = result.current.state
      act(() => result.current.deleteDeck(snapshot.decks[0]!.id))
      act(() => result.current.restore(snapshot))

      expect(readDecksState()).toEqual(snapshot)
    })
  })
})
