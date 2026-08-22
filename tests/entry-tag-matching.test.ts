import { describe, expect, it } from 'vitest'

import { buildCandidates, matchEntrySenses } from '../src/importers/entry-tag-matching.js'
import type { WiktextractRecord } from '../src/importers/wiktextract.js'

describe('buildCandidates', () => {
  it('maps a recognized wiktextract pos onto PART_OF_SPEECH', () => {
    const index = new Map<string, WiktextractRecord[]>([
      ['我', [{ word: '我', pos: 'pron', senses: [{ tags: ['dialectal'] }] }]],
    ])
    expect(buildCandidates(['我'], index)).toEqual([{ pos: 'pronoun', tags: ['dialectal'], altOf: [] }])
  })

  it('leaves pos undefined for a wiktextract value with no equivalent', () => {
    const index = new Map<string, WiktextractRecord[]>([
      ['馬', [{ word: '馬', pos: 'character', senses: [{ tags: ['abbreviation'] }] }]],
    ])
    expect(buildCandidates(['馬'], index)[0]?.pos).toBeUndefined()
  })

  it('keeps a sense with no tag/alt_of signal after filtering, as an empty-signal candidate', () => {
    // Not dropped: matchEntrySenses's cardinality check needs the *total*
    // sense count, tagged or not — see buildCandidates's doc comment.
    const index = new Map<string, WiktextractRecord[]>([['犬', [{ word: '犬', senses: [{ tags: ['Cantonese'] }] }]]])
    expect(buildCandidates(['犬'], index)).toEqual([{ pos: undefined, tags: [], altOf: [] }])
  })

  it('unions candidates across headword and variants', () => {
    const index = new Map<string, WiktextractRecord[]>([
      ['一', [{ word: '一', pos: 'numeral', senses: [{ tags: ['literary'] }] }]],
      ['壹', [{ word: '壹', pos: 'numeral', senses: [{ tags: ['formal'] }] }]],
    ])
    const candidates = buildCandidates(['一', '壹'], index)
    expect(candidates).toHaveLength(2)
  })
})

describe('matchEntrySenses', () => {
  it('matches unambiguously when both sides have exactly one sense', () => {
    const matches = matchEntrySenses(['verb'], [{ pos: undefined, tags: ['obsolete'], altOf: [] }])
    expect(matches.get(0)).toEqual({ tags: ['obsolete'], altOf: [] })
  })

  it('disambiguates multiple senses by pos', () => {
    const candidates = [
      { pos: 'noun' as const, tags: ['literary'], altOf: [] },
      { pos: 'adjective' as const, tags: ['colloquial'], altOf: [] },
    ]
    const matches = matchEntrySenses(['noun', 'adjective'], candidates)
    expect(matches.get(0)).toEqual({ tags: ['literary'], altOf: [] })
    expect(matches.get(1)).toEqual({ tags: ['colloquial'], altOf: [] })
  })

  it('skips a sense when more than one candidate shares its pos', () => {
    const candidates = [
      { pos: 'noun' as const, tags: ['literary'], altOf: [] },
      { pos: 'noun' as const, tags: ['obsolete'], altOf: [] },
    ]
    const matches = matchEntrySenses(['noun'], candidates)
    expect(matches.size).toBe(0)
  })

  it('skips a sense when no candidate shares its pos', () => {
    const candidates = [{ pos: 'verb' as const, tags: ['literary'], altOf: [] }]
    const matches = matchEntrySenses(['noun', 'adjective'], candidates)
    expect(matches.size).toBe(0)
  })

  it('returns nothing when there are no candidates', () => {
    expect(matchEntrySenses(['verb'], []).size).toBe(0)
  })

  it('records no match for a candidate that wins the cardinality check but carries nothing to attach', () => {
    const matches = matchEntrySenses(['verb'], [{ pos: undefined, tags: [], altOf: [] }])
    expect(matches.size).toBe(0)
  })

  it('regression (壬): does not attach a page\'s only tagged sense to an entry documenting an unrelated, untagged sense', () => {
    // 壬 has four wiktextract senses — "ninth heavenly stem" / "crafty" / "a
    // surname" (all untagged) and a tagged "eye dialect spelling of 人". Our
    // entry documents only the first, untagged sense. Before this was fixed,
    // buildCandidates dropped the three untagged senses, leaving one
    // candidate that looked like an unambiguous match against the entry's
    // one sense — attaching the wrong tags (see entry-tag-matching.js).
    const candidates = [
      { pos: 'noun' as const, tags: [], altOf: [] }, // ninth heavenly stem — the entry's actual sense
      { pos: 'noun' as const, tags: [], altOf: [] }, // crafty
      { pos: 'noun' as const, tags: [], altOf: [] }, // a surname
      { pos: 'noun' as const, tags: ['Internet', 'alt-of', 'derogatory'], altOf: ['人'] }, // eye dialect for 人
    ]
    const matches = matchEntrySenses(['noun'], candidates)
    expect(matches.size).toBe(0)
  })
})
