import { describe, expect, it } from 'vitest'
import { createSearchIndex, search } from './searchIndex'
import { makeEntry } from '../test/entryFixtures'

// This suite's queries exercise search_keys beyond the shared fixture's bare
// defaults (toneless/diacritic-stripped Peng'im and POJ variants — see
// src/build/enrich.ts), so the base entry carries its own fuller list.
const BASE_SEARCH_KEYS = ['潮州', 'dio5 ziu1', 'dio ziu', 'dioziu', 'tiô-tsiu', 'tio-tsiu', 'Chaozhou', 'Teochew']

describe('createSearchIndex / search', () => {
  const entries = [
    makeEntry({ search_keys: BASE_SEARCH_KEYS }),
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

describe('search ranking', () => {
  // The near-misses that used to flood a short English query: at threshold
  // 0.35 Fuse allowed one character error anywhere, so "wood" matched
  // blood/flood/good/food and buried the real entry hundreds of rows down.
  const entries = [
    makeEntry({ id: 'blood', headword: '血', search_keys: ['血', 'huêh4', 'blood'], senses: [{ pos: 'noun', gloss_en: ['blood'] }] }),
    makeEntry({ id: 'good', headword: '好', search_keys: ['好', 'ho2', 'good'], senses: [{ pos: 'adjective', gloss_en: ['good'] }] }),
    makeEntry({ id: 'food', headword: '食品', search_keys: ['食品', 'ziah8 bing2', 'food'], senses: [{ pos: 'noun', gloss_en: ['food'] }] }),
    makeEntry({ id: 'wood', headword: '木', search_keys: ['木', 'bhog8', 'wood', 'timber'], senses: [{ pos: 'noun', gloss_en: ['wood', 'timber'] }] }),
    makeEntry({ id: 'firewood', headword: '柴', search_keys: ['柴', 'ca5', 'firewood'], senses: [{ pos: 'noun', gloss_en: ['firewood'] }] }),
  ]
  const index = createSearchIndex(entries)

  it('ranks the entry glossed "wood" first for the query "wood"', () => {
    expect(search(index, 'wood')[0]?.id).toBe('wood')
  })

  it('does not match one-character-off glosses like blood/good/food', () => {
    const ids = search(index, 'wood').map((e) => e.id)
    expect(ids).not.toContain('blood')
    expect(ids).not.toContain('good')
    expect(ids).not.toContain('food')
  })

  it('still tolerates typos in longer Peng\'im strings', () => {
    expect(search(index, 'ziah bing').map((e) => e.id)).toContain('food')
  })
})

describe('search literalness tiers', () => {
  // "eat" is a substring of meat/heating/sweat, which Fuse scores no worse
  // than the entry actually glossed "to eat" — that one sat at #183 of 411.
  const entries = [
    makeEntry({ id: 'meat-paste', headword: '肉醬', search_keys: ['肉醬', 'nêg8 ziòⁿ', 'meat paste'], senses: [{ pos: 'noun', gloss_en: ['meat paste'] }] }),
    makeEntry({ id: 'heating', headword: '暖氣', search_keys: ['暖氣', 'nuang2 ki3', 'heating'], senses: [{ pos: 'noun', gloss_en: ['heating'] }] }),
    makeEntry({ id: 'sweater', headword: '毛衫', search_keys: ['毛衫', 'mo5 sam1', 'sweater'], senses: [{ pos: 'noun', gloss_en: ['sweater'] }] }),
    makeEntry({ id: 'to-eat', headword: '食', search_keys: ['食', 'ziah8', 'to eat'], senses: [{ pos: 'verb', gloss_en: ['to eat'] }] }),
  ]
  const index = createSearchIndex(entries)

  it('ranks a whole-word gloss match above entries that merely embed the query', () => {
    expect(search(index, 'eat').map((e) => e.id)[0]).toBe('to-eat')
  })

  it('ranks an exact key match above a whole-word one', () => {
    const withExact = [
      ...entries,
      makeEntry({ id: 'eat-exact', headword: '茹', search_keys: ['茹', 'ru5', 'eat'], senses: [{ pos: 'verb', gloss_en: ['eat'] }] }),
    ]
    expect(search(createSearchIndex(withExact), 'eat').map((e) => e.id)[0]).toBe('eat-exact')
  })

  it('treats a regex metacharacter in the query as a literal', () => {
    expect(() => search(index, 'e(a[t')).not.toThrow()
  })

  it('keeps every hit, only reordering them', () => {
    expect(search(index, 'eat')).toHaveLength(
      createSearchIndex(entries).search('eat').length,
    )
  })
})
