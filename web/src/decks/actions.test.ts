import { describe, expect, it } from 'vitest'
import * as actions from './actions'
import type { DecksState } from './storage'
import type { Deck } from './types'

function deck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user', ...overrides }
}

function state(overrides: Partial<DecksState> = {}): DecksState {
  return { decks: [], inPlay: [], groups: [], ...overrides }
}

describe('addDeck', () => {
  it('appends the deck', () => {
    const next = actions.addDeck(state(), deck())
    expect(next.decks).toEqual([deck()])
  })
})

describe('renameDeck', () => {
  it('renames the matching deck only', () => {
    const s = state({ decks: [deck({ id: 'a', name: 'Old' }), deck({ id: 'b', name: 'Other' })] })
    const next = actions.renameDeck(s, 'a', 'New')
    expect(next.decks.map((d) => d.name)).toEqual(['New', 'Other'])
  })

  it('is a no-op when the id does not match any deck', () => {
    const s = state({ decks: [deck({ id: 'a' })] })
    expect(actions.renameDeck(s, 'missing', 'New')).toEqual(s)
  })
})

describe('deleteDeck', () => {
  it('removes the deck, drops it from inPlay, and drops it from every group', () => {
    const s: DecksState = {
      decks: [deck({ id: 'a' }), deck({ id: 'b' })],
      inPlay: ['a', 'b'],
      groups: [{ id: 'g1', name: 'G', deckIds: ['a', 'b'] }],
    }
    const next = actions.deleteDeck(s, 'a')
    expect(next.decks.map((d) => d.id)).toEqual(['b'])
    expect(next.inPlay).toEqual(['b'])
    expect(next.groups[0]!.deckIds).toEqual(['b'])
  })
})

describe('reorderDecks', () => {
  it('reorders decks to match the given id order', () => {
    const s = state({ decks: [deck({ id: 'a' }), deck({ id: 'b' }), deck({ id: 'c' })] })
    const next = actions.reorderDecks(s, ['c', 'a', 'b'])
    expect(next.decks.map((d) => d.id)).toEqual(['c', 'a', 'b'])
  })

  it('drops ids that no longer match any deck', () => {
    const s = state({ decks: [deck({ id: 'a' }), deck({ id: 'b' })] })
    const next = actions.reorderDecks(s, ['b', 'ghost', 'a'])
    expect(next.decks.map((d) => d.id)).toEqual(['b', 'a'])
  })
})

describe('addCardToDeck / removeCardFromDeck', () => {
  it('adds a card to the end of the deck', () => {
    const s = state({ decks: [deck({ id: 'a', cards: ['x'] })] })
    const next = actions.addCardToDeck(s, 'a', 'y')
    expect(next.decks[0]!.cards).toEqual(['x', 'y'])
  })

  it('does not add a duplicate card', () => {
    const s = state({ decks: [deck({ id: 'a', cards: ['x'] })] })
    const next = actions.addCardToDeck(s, 'a', 'x')
    expect(next.decks[0]!.cards).toEqual(['x'])
  })

  it('removes a card', () => {
    const s = state({ decks: [deck({ id: 'a', cards: ['x', 'y'] })] })
    const next = actions.removeCardFromDeck(s, 'a', 'x')
    expect(next.decks[0]!.cards).toEqual(['y'])
  })

  it('removing a card that is not present is a no-op', () => {
    const s = state({ decks: [deck({ id: 'a', cards: ['x'] })] })
    const next = actions.removeCardFromDeck(s, 'a', 'ghost')
    expect(next.decks[0]!.cards).toEqual(['x'])
  })
})

describe('setInPlay / addToPlay / removeFromPlay / reorderPlay', () => {
  it('setInPlay replaces the table outright', () => {
    expect(actions.setInPlay(state({ inPlay: ['a'] }), ['b', 'c']).inPlay).toEqual(['b', 'c'])
  })

  it('addToPlay appends and does not duplicate an already-in-play deck', () => {
    const s = state({ inPlay: ['a'] })
    expect(actions.addToPlay(s, 'b').inPlay).toEqual(['a', 'b'])
    expect(actions.addToPlay(s, 'a').inPlay).toEqual(['a'])
  })

  it('removeFromPlay drops the given id', () => {
    expect(actions.removeFromPlay(state({ inPlay: ['a', 'b'] }), 'a').inPlay).toEqual(['b'])
  })

  it('reorderPlay replaces the table order verbatim', () => {
    expect(actions.reorderPlay(state({ inPlay: ['a', 'b'] }), ['b', 'a']).inPlay).toEqual(['b', 'a'])
  })
})

describe('moveToPlay', () => {
  it('inserts a not-yet-in-play deck at the start', () => {
    expect(actions.moveToPlay(state({ inPlay: ['a', 'b'] }), 'c', 0).inPlay).toEqual(['c', 'a', 'b'])
  })

  it('inserts a not-yet-in-play deck in the middle', () => {
    expect(actions.moveToPlay(state({ inPlay: ['a', 'b'] }), 'c', 1).inPlay).toEqual(['a', 'c', 'b'])
  })

  it('appends when index is omitted', () => {
    expect(actions.moveToPlay(state({ inPlay: ['a', 'b'] }), 'c').inPlay).toEqual(['a', 'b', 'c'])
  })

  it('repositions an already-in-play deck instead of duplicating it', () => {
    expect(actions.moveToPlay(state({ inPlay: ['a', 'b', 'c'] }), 'a', 2).inPlay).toEqual(['b', 'c', 'a'])
  })

  it('clamps an out-of-range index', () => {
    expect(actions.moveToPlay(state({ inPlay: ['a', 'b'] }), 'c', 99).inPlay).toEqual(['a', 'b', 'c'])
    expect(actions.moveToPlay(state({ inPlay: ['a', 'b'] }), 'c', -5).inPlay).toEqual(['c', 'a', 'b'])
  })
})

describe('saveGroup / deleteGroup / loadGroup', () => {
  it('saveGroup adds a new group', () => {
    const next = actions.saveGroup(state(), { id: 'g1', name: 'Evenings', deckIds: ['a'] })
    expect(next.groups).toEqual([{ id: 'g1', name: 'Evenings', deckIds: ['a'] }])
  })

  it('saveGroup replaces an existing group with the same id', () => {
    const s = state({ groups: [{ id: 'g1', name: 'Old', deckIds: ['a'] }] })
    const next = actions.saveGroup(s, { id: 'g1', name: 'New', deckIds: ['b'] })
    expect(next.groups).toEqual([{ id: 'g1', name: 'New', deckIds: ['b'] }])
  })

  it('deleteGroup removes the matching group', () => {
    const s = state({ groups: [{ id: 'g1', name: 'A', deckIds: [] }, { id: 'g2', name: 'B', deckIds: [] }] })
    expect(actions.deleteGroup(s, 'g1').groups.map((g) => g.id)).toEqual(['g2'])
  })

  it('loadGroup replaces inPlay with the group deck ids', () => {
    const s = state({ inPlay: ['x'], groups: [{ id: 'g1', name: 'A', deckIds: ['a', 'b'] }] })
    expect(actions.loadGroup(s, 'g1').inPlay).toEqual(['a', 'b'])
  })

  it('loadGroup is a no-op when the group id does not exist', () => {
    const s = state({ inPlay: ['x'], groups: [] })
    expect(actions.loadGroup(s, 'missing')).toEqual(s)
  })
})

describe('moveCardBetweenDecks', () => {
  const state = () => ({
    decks: [
      { id: 'a', name: 'A', hue: 'red' as const, kind: 'user' as const, cards: ['x', 'y'] },
      { id: 'b', name: 'B', hue: 'blue' as const, kind: 'user' as const, cards: ['z'] },
    ],
    inPlay: [],
    groups: [],
  })

  it('takes the card out of one deck and puts it in the other, in one step', () => {
    const next = actions.moveCardBetweenDecks(state(), 'a', 'b', 'x')
    expect(next.decks[0]!.cards).toEqual(['y'])
    expect(next.decks[1]!.cards).toEqual(['z', 'x'])
  })

  it('is a no-op when the source and target are the same deck', () => {
    const before = state()
    expect(actions.moveCardBetweenDecks(before, 'a', 'a', 'x')).toBe(before)
  })

  it('still leaves the source when the target already holds the card', () => {
    const withDuplicate = state()
    withDuplicate.decks[1]!.cards = ['z', 'x']
    const next = actions.moveCardBetweenDecks(withDuplicate, 'a', 'b', 'x')
    expect(next.decks[0]!.cards).toEqual(['y'])
    expect(next.decks[1]!.cards).toEqual(['z', 'x'])
  })

  it('leaves other decks alone', () => {
    const next = actions.moveCardBetweenDecks(state(), 'a', 'b', 'gone')
    expect(next.decks[0]!.cards).toEqual(['x', 'y'])
    expect(next.decks[1]!.cards).toEqual(['z', 'gone'])
  })
})
