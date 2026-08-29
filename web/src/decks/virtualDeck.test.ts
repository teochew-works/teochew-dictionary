import { describe, expect, it } from 'vitest'
import { DICTIONARY_DECK_ID, isVirtualDeckId, makeDictionaryDeck } from './virtualDeck'
import { makeEntry } from '../test/entryFixtures'

describe('makeDictionaryDeck', () => {
  it('carries every loaded entry id as its cards, in entry order', () => {
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' }), makeEntry({ id: 'c' })]
    const deck = makeDictionaryDeck(entries)
    expect(deck.cards).toEqual(['a', 'b', 'c'])
  })

  it('is flagged virtual and uses the well-known dictionary id', () => {
    const deck = makeDictionaryDeck([])
    expect(deck.kind).toBe('virtual')
    expect(deck.id).toBe(DICTIONARY_DECK_ID)
  })

  it('reflects zero entries as an empty deck rather than erroring', () => {
    expect(makeDictionaryDeck([]).cards).toEqual([])
  })
})

describe('isVirtualDeckId', () => {
  it('is true only for the dictionary id', () => {
    expect(isVirtualDeckId(DICTIONARY_DECK_ID)).toBe(true)
    expect(isVirtualDeckId('deck-abc123')).toBe(false)
  })
})
