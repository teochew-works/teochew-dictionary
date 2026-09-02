import { beforeEach, describe, expect, it } from 'vitest'
import { defaultDecksState, readDecksState, writeDecksState } from './storage'
import type { DecksState } from './storage'
import { DICTIONARY_DECK_ID } from './virtualDeck'
import type { Deck } from '@teochew/core'

const KEY = 'teochew-dictionary:decks/v1'

const SAMPLE_DECK: Deck = { id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['a', 'b'], kind: 'user' }

describe('readDecksState / writeDecksState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to no user decks and the dictionary in play when nothing is stored', () => {
    expect(readDecksState()).toEqual(defaultDecksState())
    expect(readDecksState().inPlay).toEqual([DICTIONARY_DECK_ID])
  })

  it('round-trips a populated state', () => {
    const state: DecksState = {
      decks: [SAMPLE_DECK],
      inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
      groups: [{ id: 'group-1', name: 'Evenings', deckIds: ['deck-1'] }],
    }
    writeDecksState(state)
    expect(readDecksState()).toEqual(state)
  })

  it('falls back to the default on unparseable JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(readDecksState()).toEqual(defaultDecksState())
  })

  it('falls back to the default when the stored value is a JSON scalar, not an object', () => {
    localStorage.setItem(KEY, '"just a string"')
    expect(readDecksState()).toEqual(defaultDecksState())
  })

  it('falls back to the default when a stored deck is missing a required field', () => {
    localStorage.setItem(KEY, JSON.stringify({ decks: [{ id: 'deck-1', name: 'Kitchen' }], inPlay: [], groups: [] }))
    expect(readDecksState()).toEqual(defaultDecksState())
  })

  it('falls back to the default when a stored deck has an unrecognized hue', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ decks: [{ ...SAMPLE_DECK, hue: 'ultraviolet' }], inPlay: [], groups: [] }),
    )
    expect(readDecksState()).toEqual(defaultDecksState())
  })

  it('falls back to the default when a stored deck claims the reserved dictionary id', () => {
    localStorage.setItem(KEY, JSON.stringify({ decks: [{ ...SAMPLE_DECK, id: DICTIONARY_DECK_ID }], inPlay: [], groups: [] }))
    expect(readDecksState()).toEqual(defaultDecksState())
  })

  it('falls back to the default when a stored deck claims kind "virtual"', () => {
    localStorage.setItem(KEY, JSON.stringify({ decks: [{ ...SAMPLE_DECK, kind: 'virtual' }], inPlay: [], groups: [] }))
    expect(readDecksState()).toEqual(defaultDecksState())
  })

  it('falls back to the default when a group is missing deckIds', () => {
    localStorage.setItem(KEY, JSON.stringify({ decks: [], inPlay: [], groups: [{ id: 'g1', name: 'X' }] }))
    expect(readDecksState()).toEqual(defaultDecksState())
  })

  it('does not throw when localStorage.getItem throws', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    try {
      expect(readDecksState()).toEqual(defaultDecksState())
    } finally {
      Storage.prototype.getItem = original
    }
  })

  it('does not throw when localStorage.setItem throws', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded')
    }
    try {
      expect(() => writeDecksState(defaultDecksState())).not.toThrow()
    } finally {
      Storage.prototype.setItem = original
    }
  })
})
