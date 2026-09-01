import { describe, expect, it } from 'vitest'
import { firstEmptyStage, runDeckPipeline, resolveDecks, significantStages, stageCount } from './pipeline.js'
import type { DeckPipelineInput } from './pipeline.js'
import { DEFAULT_LEVEL_FILTER } from '../flashcards/levelFilter.js'
import { makeEntry, makeReading } from '../test/entryFixtures.js'
import type { Deck } from './types.js'

function deck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', name: 'Deck', hue: 'green', cards: [], kind: 'user', ...overrides }
}

function baseInput(overrides: Partial<DeckPipelineInput> = {}): DeckPipelineInput {
  return {
    decks: [],
    inPlay: [],
    entryById: new Map(),
    mode: 'chinese',
    levelFilter: DEFAULT_LEVEL_FILTER,
    fullAudioOnly: false,
    ...overrides,
  }
}

describe('runDeckPipeline — union and de-duplication', () => {
  it('unions the cards of every in-play deck', () => {
    const a = makeEntry({ id: 'a' })
    const b = makeEntry({ id: 'b' })
    const deckA = deck({ id: 'deck-a', cards: ['a'] })
    const deckB = deck({ id: 'deck-b', cards: ['b'] })

    const result = runDeckPipeline(
      baseInput({
        decks: [deckA, deckB],
        inPlay: ['deck-a', 'deck-b'],
        entryById: new Map([
          ['a', a],
          ['b', b],
        ]),
      }),
    )

    expect(result.entries.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('reviews an entry in two decks exactly once, not twice', () => {
    const shared = makeEntry({ id: 'shared' })
    const deckA = deck({ id: 'deck-a', cards: ['shared'] })
    const deckB = deck({ id: 'deck-b', cards: ['shared'] })

    const result = runDeckPipeline(
      baseInput({
        decks: [deckA, deckB],
        inPlay: ['deck-a', 'deck-b'],
        entryById: new Map([['shared', shared]]),
      }),
    )

    expect(result.entries.map((e) => e.id)).toEqual(['shared'])
  })

  it('keeps the first-seen deck-play-order position of a duplicate, not the later one', () => {
    const shared = makeEntry({ id: 'shared' })
    const only = makeEntry({ id: 'only-in-b' })
    const deckA = deck({ id: 'deck-a', cards: ['shared'] })
    const deckB = deck({ id: 'deck-b', cards: ['only-in-b', 'shared'] })

    const result = runDeckPipeline(
      baseInput({
        decks: [deckA, deckB],
        inPlay: ['deck-a', 'deck-b'],
        entryById: new Map([
          ['shared', shared],
          ['only-in-b', only],
        ]),
      }),
    )

    expect(result.entries.map((e) => e.id)).toEqual(['shared', 'only-in-b'])
  })

  it('preserves within-deck insertion order', () => {
    const entries = ['c', 'a', 'b'].map((id) => makeEntry({ id }))
    const d = deck({ cards: ['c', 'a', 'b'] })

    const result = runDeckPipeline(
      baseInput({ decks: [d], inPlay: [d.id], entryById: new Map(entries.map((e) => [e.id, e])) }),
    )

    expect(result.entries.map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })

  it('skips an inPlay id with no matching deck instead of throwing', () => {
    const result = runDeckPipeline(baseInput({ decks: [], inPlay: ['ghost-deck'], entryById: new Map() }))
    expect(result.entries).toEqual([])
  })

  it('skips a card id with no matching entry (a stale id after a lexicon rebuild) instead of throwing', () => {
    const d = deck({ cards: ['gone', 'still-here'] })
    const stillHere = makeEntry({ id: 'still-here' })

    const result = runDeckPipeline(baseInput({ decks: [d], inPlay: [d.id], entryById: new Map([['still-here', stillHere]]) }))

    expect(result.entries.map((e) => e.id)).toEqual(['still-here'])
  })
})

describe('runDeckPipeline — filter stages run over the merged pool', () => {
  it('applies prompt-mode eligibility across decks, not per-deck', () => {
    const withGloss = makeEntry({ id: 'a', senses: [{ pos: 'noun', gloss_en: ['hi'] }] })
    const glossless = makeEntry({ id: 'b', senses: [{ pos: 'noun', gloss_en: [] }] })
    const deckA = deck({ id: 'deck-a', cards: ['a'] })
    const deckB = deck({ id: 'deck-b', cards: ['b'] })

    const result = runDeckPipeline(
      baseInput({
        decks: [deckA, deckB],
        inPlay: ['deck-a', 'deck-b'],
        mode: 'english',
        entryById: new Map([
          ['a', withGloss],
          ['b', glossless],
        ]),
      }),
    )

    expect(result.entries.map((e) => e.id)).toEqual(['a'])
  })

  it('applies the level filter across decks', () => {
    const a1 = makeEntry({ id: 'a', level: 'A1' })
    const b1 = makeEntry({ id: 'b', level: 'B1' })
    const d = deck({ cards: ['a', 'b'] })

    const result = runDeckPipeline(
      baseInput({
        decks: [d],
        inPlay: [d.id],
        levelFilter: new Set(['A1']),
        entryById: new Map([
          ['a', a1],
          ['b', b1],
        ]),
      }),
    )

    expect(result.entries.map((e) => e.id)).toEqual(['a'])
  })

  it('applies the full-audio filter only when enabled', () => {
    const clip = { key: 'x', url: 'https://example.com/x.opus', confidence: 'high' as const, licence: 'CC-BY-4.0', attributions: [] }
    const full = makeEntry({ id: 'full', readings: [makeReading({ audio: [clip] })] })
    const partial = makeEntry({ id: 'partial', readings: [makeReading({ audio: [null] })] })
    const d = deck({ cards: ['full', 'partial'] })
    const entryById = new Map([
      ['full', full],
      ['partial', partial],
    ])

    const withoutFilter = runDeckPipeline(baseInput({ decks: [d], inPlay: [d.id], entryById, fullAudioOnly: false }))
    expect(withoutFilter.entries.map((e) => e.id)).toEqual(['full', 'partial'])

    const withFilter = runDeckPipeline(baseInput({ decks: [d], inPlay: [d.id], entryById, fullAudioOnly: true }))
    expect(withFilter.entries.map((e) => e.id)).toEqual(['full'])
  })

  it('reports a count for every stage, in order, even when a stage removes nothing', () => {
    const a = makeEntry({ id: 'a' })
    const d = deck({ cards: ['a'] })
    const result = runDeckPipeline(baseInput({ decks: [d], inPlay: [d.id], entryById: new Map([['a', a]]) }))
    expect(result.stages).toEqual([
      { key: 'in-play', count: 1 },
      { key: 'mode', count: 1 },
      { key: 'level', count: 1 },
      { key: 'audio', count: 1 },
    ])
  })
})

describe('resolveDecks', () => {
  it('resolves ids to decks in the given order', () => {
    const a = deck({ id: 'a' })
    const b = deck({ id: 'b' })
    expect(resolveDecks(['b', 'a'], [a, b])).toEqual([b, a])
  })

  it('drops ids with no matching deck', () => {
    const a = deck({ id: 'a' })
    expect(resolveDecks(['a', 'ghost'], [a])).toEqual([a])
  })
})

describe('significantStages', () => {
  it('keeps only the first stage and stages whose count differs from the previous kept stage', () => {
    const stages = [
      { key: 'in-play' as const, count: 1248 },
      { key: 'mode' as const, count: 1248 },
      { key: 'level' as const, count: 892 },
      { key: 'audio' as const, count: 892 },
    ]
    expect(significantStages(stages)).toEqual([
      { key: 'in-play', count: 1248 },
      { key: 'level', count: 892 },
    ])
  })

  it('always keeps the first stage even at zero', () => {
    expect(significantStages([{ key: 'in-play', count: 0 }])).toEqual([{ key: 'in-play', count: 0 }])
  })
})

describe('firstEmptyStage', () => {
  it('returns the first stage with a zero count', () => {
    const stages = [
      { key: 'in-play' as const, count: 5 },
      { key: 'mode' as const, count: 0 },
      { key: 'level' as const, count: 0 },
      { key: 'audio' as const, count: 0 },
    ]
    expect(firstEmptyStage(stages)).toEqual({ key: 'mode', count: 0 })
  })

  it('returns null when no stage is empty', () => {
    expect(firstEmptyStage([{ key: 'in-play', count: 1 }])).toBeNull()
  })
})

describe('stageCount', () => {
  it('finds the count for the given stage key', () => {
    const stages = [
      { key: 'in-play' as const, count: 5 },
      { key: 'mode' as const, count: 3 },
    ]
    expect(stageCount(stages, 'mode')).toBe(3)
  })

  it('returns 0 for a stage key not present', () => {
    expect(stageCount([{ key: 'in-play', count: 5 }], 'audio')).toBe(0)
  })
})
