import { describe, expect, it } from 'vitest'

import { buildStarterDecks } from '../src/build/starter-decks.js'
import type { LoadedEntry } from '../src/data/load.js'
import type { Entry } from '../src/schema/entry.js'
import type { StarterDecksFile } from '../src/schema/starter-decks.js'

function entry(overrides: Partial<Entry> & Pick<Entry, 'id' | 'headword'>): LoadedEntry {
  return {
    file: 'fixture.yaml',
    entry: {
      readings: [{ pengim: 'a1', variety: 'chaozhou' }],
      senses: [{ pos: 'noun', gloss_en: ['x'] }],
      sources: ['fixture'],
      ...overrides,
    } as Entry,
  }
}

describe('buildStarterDecks', () => {
  it('resolves a headword to its entry id', () => {
    const loaded = [entry({ id: 'gau2-狗', headword: '狗' })]
    const file: StarterDecksFile = {
      decks: [{ id: 'animals', name: 'Animals', items: [{ headword: '狗', gloss: 'dog' }] }],
    }

    const result = buildStarterDecks(loaded, file)

    expect(result.decks).toEqual([{ id: 'animals', name: 'Animals', cards: ['gau2-狗'] }])
    expect(result.unresolved).toEqual([])
  })

  it('resolves against a variant, not just the primary headword', () => {
    const loaded = [entry({ id: 'x-字', headword: '字', variants: ['別字'] })]
    const file: StarterDecksFile = {
      decks: [{ id: 'd', name: 'D', items: [{ headword: '別字', gloss: 'y' }] }],
    }

    const result = buildStarterDecks(loaded, file)

    expect(result.decks[0]!.cards).toEqual(['x-字'])
  })

  it('drops an unresolved headword from cards and reports it, without failing', () => {
    const loaded = [entry({ id: 'gau2-狗', headword: '狗' })]
    const file: StarterDecksFile = {
      decks: [
        {
          id: 'animals',
          name: 'Animals',
          items: [
            { headword: '狗', gloss: 'dog' },
            { headword: '象', gloss: 'elephant' },
          ],
        },
      ],
    }

    const result = buildStarterDecks(loaded, file)

    expect(result.decks[0]!.cards).toEqual(['gau2-狗'])
    expect(result.unresolved).toEqual([{ deckId: 'animals', headword: '象' }])
  })

  it('still emits a deck with an empty cards array when nothing resolves', () => {
    const file: StarterDecksFile = {
      decks: [{ id: 'empty', name: 'Empty', items: [{ headword: '象', gloss: 'elephant' }] }],
    }

    const result = buildStarterDecks([], file)

    expect(result.decks).toEqual([{ id: 'empty', name: 'Empty', cards: [] }])
    expect(result.unresolved).toEqual([{ deckId: 'empty', headword: '象' }])
  })

  it('keeps decks in file order and each deck resolved independently', () => {
    const loaded = [entry({ id: 'a-阿', headword: '阿' }), entry({ id: 'b-抑', headword: '抑' })]
    const file: StarterDecksFile = {
      decks: [
        { id: 'first', name: 'First', items: [{ headword: '阿', gloss: 'a' }] },
        { id: 'second', name: 'Second', items: [{ headword: '抑', gloss: 'b' }] },
      ],
    }

    const result = buildStarterDecks(loaded, file)

    expect(result.decks.map((d) => d.id)).toEqual(['first', 'second'])
    expect(result.decks[0]!.cards).toEqual(['a-阿'])
    expect(result.decks[1]!.cards).toEqual(['b-抑'])
  })
})
