import { describe, expect, it } from 'vitest'

import { buildSounds } from '../src/build/sounds.js'
import type { LoadedEntry } from '../src/data/load.js'
import type { Entry } from '../src/schema/entry.js'

function entry(overrides: Partial<Entry> & Pick<Entry, 'id' | 'headword' | 'readings'>): LoadedEntry {
  return {
    file: 'fixture.yaml',
    entry: {
      senses: [{ pos: 'noun', gloss_en: ['x'] }],
      sources: ['fixture'],
      ...overrides,
    } as Entry,
  }
}

describe('buildSounds', () => {
  it('derives IPA and sorts sounds by Peng\'im', () => {
    const data = buildSounds([
      entry({ id: 'a', headword: '阿', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }),
      entry({ id: 'b', headword: '抑', readings: [{ pengim: 'a3', variety: 'chaozhou' }] }),
    ])

    expect(data.variety).toBe('chaozhou')
    expect(data.sounds.map((s) => s.pengim)).toEqual(['a1', 'a3'])
    expect(data.sounds[0]!.ipa).toBe('a³³')
  })

  it('attests every syllable in a multi-syllable reading, not just the whole word', () => {
    const data = buildSounds([
      entry({
        id: 'dio5-ziu1-潮州',
        headword: '潮州',
        readings: [{ pengim: 'dio5 ziu1', variety: 'chaozhou' }],
      }),
    ])

    expect(data.sounds.map((s) => s.pengim)).toEqual(['dio5', 'ziu1'])
  })

  it('prefers shorter, more frequent readings as examples, capped at 3', () => {
    const data = buildSounds([
      entry({
        id: 'compound',
        headword: '複合詞',
        frequency: 5,
        readings: [{ pengim: 'a1 zi6', variety: 'chaozhou' }],
      }),
      entry({
        id: 'rare',
        headword: '罕見',
        frequency: 1,
        readings: [{ pengim: 'a1', variety: 'chaozhou' }],
      }),
      entry({
        id: 'common',
        headword: '常見',
        frequency: 5,
        readings: [{ pengim: 'a1', variety: 'chaozhou' }],
      }),
    ])

    const a1 = data.sounds.find((s) => s.pengim === 'a1')!
    // Monosyllabic readings rank ahead of the compound word regardless of
    // frequency, and among monosyllabic readings the higher-frequency one
    // comes first.
    expect(a1.examples.map((e) => e.headword)).toEqual(['常見', '罕見', '複合詞'])
  })

  it('excludes hidden entries from examples but still counts the sound as attested', () => {
    const data = buildSounds([
      entry({ id: 'hidden', headword: '隱藏', hidden: true, readings: [{ pengim: 'a1', variety: 'chaozhou' }] }),
    ])

    const a1 = data.sounds.find((s) => s.pengim === 'a1')
    expect(a1).toBeDefined()
    expect(a1!.examples).toEqual([])
  })

  it('ignores non-Chaozhou readings', () => {
    const data = buildSounds([
      entry({ id: 'x', headword: '某', readings: [{ pengim: 'a1', variety: 'shantou' }] }),
    ])

    expect(data.sounds).toEqual([])
  })

  it('skips malformed readings rather than throwing', () => {
    const data = buildSounds([entry({ id: 'bad', headword: '壞', readings: [{ pengim: 'za8', variety: 'chaozhou' }] })])
    expect(data.sounds).toEqual([])
  })
})
