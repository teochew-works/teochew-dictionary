import { describe, expect, it } from 'vitest'
import { createSearchIndex, search } from './searchIndex'
import type { EnrichedEntry } from '../types/dict'

function makeEntry(overrides: Partial<EnrichedEntry>): EnrichedEntry {
  return {
    id: 'dio5-ziu1-潮州',
    headword: '潮州',
    readings: [
      {
        pengim: 'dio5 ziu1',
        variety: 'chaozhou',
        ipa: 'tie⁵⁵ tsiu³³',
        poj: 'tiô-tsiu',
        sandhi: 'dio7 ziu1',
        ipa_confidence: 'medium',
        ipa_caveats: [],
        pengim_toneless: 'dio ziu',
        syllable_count: 2,
        audio: [null, null],
      },
    ],
    senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
    sources: ['seed'],
    search_keys: ['潮州', 'dio5 ziu1', 'dio ziu', 'dioziu', 'tiô-tsiu', 'tio-tsiu', 'Chaozhou', 'Teochew'],
    licence: 'CC-BY-4.0',
    attributions: [],
    ...overrides,
  }
}

describe('createSearchIndex / search', () => {
  const entries = [
    makeEntry({}),
    makeEntry({
      id: 'ziao2-鳥',
      headword: '鳥',
      search_keys: ['鳥', 'ziao2', 'ziao', 'bird'],
      senses: [{ pos: 'noun', gloss_en: ['bird'] }],
    }),
  ]
  const index = createSearchIndex(entries)

  it('finds an entry by exact headword', () => {
    const hits = search(index, '潮州')
    expect(hits.map((e) => e.id)).toContain('dio5-ziu1-潮州')
  })

  it('finds an entry by Peng\'im in search_keys', () => {
    const hits = search(index, 'dio ziu')
    expect(hits.map((e) => e.id)).toContain('dio5-ziu1-潮州')
  })

  it('finds an entry by English gloss', () => {
    const hits = search(index, 'bird')
    expect(hits.map((e) => e.id)).toContain('ziao2-鳥')
  })

  it('returns nothing for a blank query', () => {
    expect(search(index, '   ')).toEqual([])
  })

  it('returns nothing for an unrelated query', () => {
    expect(search(index, 'xyznonsense')).toEqual([])
  })
})
