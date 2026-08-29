import { describe, expect, it } from 'vitest'
import { deckStats, passesFilters, sliceLabel } from './stats'
import type { DeckFilters } from './stats'
import { DEFAULT_LEVEL_FILTER } from '../flashcards/levelFilter'
import { makeEntry, makeReading } from '../test/entryFixtures'
import type { EnrichedEntry } from '../types/dict'
import type { CardState } from '../srs/types'
import type { Deck } from './types'

const NOW = new Date('2026-08-29T00:00:00.000Z')

function entry(id: string, overrides: Partial<EnrichedEntry> = {}): EnrichedEntry {
  return makeEntry({ id, ...overrides })
}

function state(entryId: string, dueAt: string): CardState {
  return { entryId, efactor: 2.5, interval: 1, repetitions: 1, dueAt, lastReviewedAt: '2026-08-01T00:00:00.000Z' }
}

function deck(cards: string[]): Deck {
  return { id: 'd1', name: 'Food words', hue: 'red', kind: 'user', cards }
}

const allLevels: DeckFilters = { mode: 'chinese', levelFilter: new Set(DEFAULT_LEVEL_FILTER), fullAudioOnly: false }

describe('passesFilters', () => {
  it('accepts an entry that clears every stage', () => {
    expect(passesFilters(entry('a'), allLevels)).toBe(true)
  })

  it('rejects an entry with no gloss in English mode', () => {
    const glossless = entry('a', { senses: [{ pos: 'noun', gloss_en: [] }] })
    expect(passesFilters(glossless, { ...allLevels, mode: 'english' })).toBe(false)
  })

  it('rejects an entry whose level is not selected', () => {
    const a1 = entry('a', { level: 'A1' })
    expect(passesFilters(a1, { ...allLevels, levelFilter: new Set(['A2']) })).toBe(false)
  })

  it('rejects an entry without full audio when the audio filter is on', () => {
    expect(passesFilters(entry('a'), { ...allLevels, fullAudioOnly: true })).toBe(false)
  })
})

describe('deckStats', () => {
  const entries = new Map([
    ['a', entry('a')],
    ['b', entry('b')],
    ['c', entry('c')],
    ['d', entry('d', { senses: [{ pos: 'noun', gloss_en: [] }] })],
  ])

  it('splits the surviving slice into due, new, and learned', () => {
    const cards = new Map([
      ['a', state('a', '2026-08-01T00:00:00.000Z')],
      ['c', state('c', '2026-09-30T00:00:00.000Z')],
    ])
    expect(deckStats(deck(['a', 'b', 'c']), entries, cards, allLevels, NOW)).toEqual({
      total: 3,
      kept: 3,
      due: 1,
      fresh: 1,
      learned: 1,
    })
  })

  it('counts a card due exactly now as due, not learned', () => {
    const cards = new Map([['a', state('a', NOW.toISOString())]])
    expect(deckStats(deck(['a']), entries, cards, allLevels, NOW)).toMatchObject({ due: 1, learned: 0 })
  })

  it('keeps `total` at the full deck size while `kept` counts only survivors', () => {
    const stats = deckStats(deck(['a', 'd']), entries, new Map(), { ...allLevels, mode: 'english' }, NOW)
    expect(stats).toMatchObject({ total: 2, kept: 1, fresh: 1 })
  })

  it('skips card ids with no matching entry rather than counting them', () => {
    const stats = deckStats(deck(['a', 'gone']), entries, new Map(), allLevels, NOW)
    expect(stats).toMatchObject({ total: 2, kept: 1 })
  })

  it('reports zeroes for an empty deck', () => {
    expect(deckStats(deck([]), entries, new Map(), allLevels, NOW)).toEqual({ total: 0, kept: 0, due: 0, fresh: 0, learned: 0 })
  })

  it('counts entries with full word audio under the audio filter', () => {
    const withAudio = new Map([['a', entry('a', { readings: [makeReading({ wordAudio: { src: 'a.mp3' } as never })] })]])
    expect(deckStats(deck(['a']), withAudio, new Map(), { ...allLevels, fullAudioOnly: true }, NOW)).toMatchObject({ kept: 1 })
  })
})

describe('sliceLabel', () => {
  it('says nothing was cut when the whole deck survives', () => {
    expect(sliceLabel({ total: 18, kept: 18, due: 0, fresh: 18, learned: 0 })).toBe('all in play')
  })

  it('names the surviving fraction when the filters bit', () => {
    expect(sliceLabel({ total: 1200, kept: 340, due: 0, fresh: 340, learned: 0 })).toBe('340 of 1,200 pass filters')
  })

  it('treats an empty deck as fully in play rather than as a cut', () => {
    expect(sliceLabel({ total: 0, kept: 0, due: 0, fresh: 0, learned: 0 })).toBe('all in play')
  })
})
