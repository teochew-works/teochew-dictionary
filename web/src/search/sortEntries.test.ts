import { describe, expect, it } from 'vitest'
import { firstSyllableTone, groupEntries, sortFlat } from './sortEntries'
import type { EnrichedEntry, EnrichedReading } from '../types/dict'

function makeReading(overrides: Partial<EnrichedReading> = {}): EnrichedReading {
  return {
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
    wordAudio: null,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<EnrichedEntry> = {}): EnrichedEntry {
  return {
    id: 'dio5-ziu1-潮州',
    headword: '潮州',
    readings: [makeReading()],
    senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
    sources: ['seed'],
    search_keys: ['潮州', 'dio5 ziu1'],
    licence: 'CC-BY-4.0',
    attributions: [],
    ...overrides,
  }
}

describe('firstSyllableTone', () => {
  it('reads the tone digit off the first syllable of a multi-syllable string', () => {
    expect(firstSyllableTone('dio5 ziu1')).toBe(5)
  })

  it('returns null when there is no tone digit', () => {
    expect(firstSyllableTone('dioziu')).toBeNull()
  })
})

describe('sortFlat', () => {
  const entries = [
    makeEntry({ id: 'b', headword: 'Beta', senses: [{ pos: 'noun', gloss_en: ['second'] }] }),
    makeEntry({ id: 'a', headword: 'Alpha', senses: [{ pos: 'noun', gloss_en: ['first'] }] }),
  ]

  it('sorts by headword', () => {
    expect(sortFlat(entries, 'headword').map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('sorts by first English gloss', () => {
    expect(sortFlat(entries, 'english').map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('groupEntries — tone', () => {
  const risingCitationFallingSandhi = makeEntry({
    id: 'ho',
    headword: '好',
    readings: [makeReading({ pengim: 'ho2', sandhi: 'ho6', pengim_toneless: 'ho', syllable_count: 1, audio: [null] })],
  })

  it('groups by citation (pengim) tone', () => {
    const groups = groupEntries([risingCitationFallingSandhi], 'tone', 'citation')
    expect(groups).toEqual([{ key: '2', label: 'Tone 2', entries: [risingCitationFallingSandhi] }])
  })

  it('groups by sandhi tone when that source is selected', () => {
    const groups = groupEntries([risingCitationFallingSandhi], 'tone', 'sandhi')
    expect(groups).toEqual([{ key: '6', label: 'Tone 6', entries: [risingCitationFallingSandhi] }])
  })

  it('sorts tone groups numerically, not lexicographically', () => {
    const tone8 = makeEntry({ id: 't8', headword: 'X', readings: [makeReading({ pengim: 'a8', sandhi: 'a8' })] })
    const tone1 = makeEntry({ id: 't1', headword: 'Y', readings: [makeReading({ pengim: 'a1', sandhi: 'a1' })] })
    const groups = groupEntries([tone8, tone1], 'tone', 'citation')
    expect(groups.map((g) => g.key)).toEqual(['1', '8'])
  })

  it('falls back to an "Other" group when a tone digit cannot be parsed', () => {
    const untoned = makeEntry({ id: 'untoned', headword: 'Z', readings: [makeReading({ pengim: 'abc', sandhi: 'abc' })] })
    const groups = groupEntries([untoned], 'tone', 'citation')
    expect(groups).toEqual([{ key: 'other', label: 'Other', entries: [untoned] }])
  })
})

describe('groupEntries — category', () => {
  it('groups by the first tag when tags are present', () => {
    const tagged = makeEntry({ id: 'shantou', headword: '汕头', tags: ['placename', 'city'] })
    const groups = groupEntries([tagged], 'category')
    expect(groups).toEqual([{ key: 'tag:placename', label: 'Placename', entries: [tagged] }])
  })

  it('falls back to part of speech when there are no tags', () => {
    const untagged = makeEntry({ id: 'eat', headword: '食', senses: [{ pos: 'verb', gloss_en: ['eat'] }] })
    const groups = groupEntries([untagged], 'category')
    expect(groups).toEqual([{ key: 'pos:verb', label: 'Verb', entries: [untagged] }])
  })

  it('sorts groups alphabetically by label', () => {
    const verb = makeEntry({ id: 'v', headword: 'A', senses: [{ pos: 'verb', gloss_en: ['x'] }] })
    const adjective = makeEntry({ id: 'adj', headword: 'B', senses: [{ pos: 'adjective', gloss_en: ['y'] }] })
    const groups = groupEntries([verb, adjective], 'category')
    expect(groups.map((g) => g.label)).toEqual(['Adjective', 'Verb'])
  })
})
