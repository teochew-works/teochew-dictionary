import { describe, expect, it } from 'vitest'

import { buildSounds } from '../src/build/sounds.js'
import type { LoadedEntry } from '../src/data/load.js'
import type { Entry } from '../src/schema/entry.js'
import type { Audio } from '../src/schema/phonology.js'

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
    expect(data.sounds[0]!.occurrences).toBe(1)
  })

  it('attests every syllable in a multi-syllable reading, not just the whole word, and folds in the sandhi surface', () => {
    const data = buildSounds([
      entry({
        id: 'dio5-ziu1-潮州',
        headword: '潮州',
        readings: [{ pengim: 'dio5 ziu1', variety: 'chaozhou' }],
      }),
    ])

    // dio5 ziu1 sandhis to dio7 ziu1 (only the non-final syllable changes),
    // so 'dio7' now gets its own Sound row even though no headword's citation
    // form is literally "dio7" — it has no examples, but still a count.
    expect(data.sounds.map((s) => s.pengim)).toEqual(['dio5', 'dio7', 'ziu1'])
    const dio7 = data.sounds.find((s) => s.pengim === 'dio7')!
    expect(dio7.occurrences).toBe(1)
    expect(dio7.examples).toEqual([])
  })

  it('counts a syllable once for its citation occurrence and once more for its sandhi occurrence in the same reading', () => {
    const data = buildSounds([
      entry({
        id: 'compound',
        headword: '複合詞',
        readings: [{ pengim: 'a1 zi6', variety: 'chaozhou' }],
      }),
    ])

    // Tone 1 sandhis to tone 1 (data/phonology/sandhi/chaozhou.yaml), so the
    // first (non-final) syllable "a1" counts once as a citation-form
    // occurrence and once more as a sandhi-surface occurrence.
    const a1 = data.sounds.find((s) => s.pengim === 'a1')!
    expect(a1.occurrences).toBe(2)
  })

  it('sums occurrences across every attesting entry and repeated syllable', () => {
    // Tone 5 sandhis to tone 7 (data/phonology/sandhi/chaozhou.yaml), so
    // 'dio5' repeated in one reading never self-contributes via sandhi —
    // this isolates plain citation-occurrence summing from the
    // citation-plus-sandhi case covered above.
    const data = buildSounds([
      entry({ id: 'x', headword: '一', readings: [{ pengim: 'dio5', variety: 'chaozhou' }] }),
      entry({ id: 'y', headword: '二', readings: [{ pengim: 'dio5 dio5', variety: 'chaozhou' }] }),
    ])

    const dio5 = data.sounds.find((s) => s.pengim === 'dio5')!
    expect(dio5.occurrences).toBe(3)
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

  it('attaches every recorded clip for a syllable, stripped to playback fields (issue #134)', () => {
    const audio: Audio = {
      audio: { id: 'chaozhou', variety: 'chaozhou' },
      clips: {
        a1: [
          { url: 'https://a.example/1', confidence: 'high', sources: ['x'], checksum: `sha256:${'a'.repeat(64)}`, speaker: 'x' },
          { url: 'https://a.example/2', confidence: 'low', sources: ['x'], checksum: `sha256:${'b'.repeat(64)}` },
        ],
      },
    }
    const data = buildSounds(
      [entry({ id: 'a', headword: '阿', readings: [{ pengim: 'a1', variety: 'chaozhou' }] })],
      undefined,
      audio,
    )
    const a1 = data.sounds.find((s) => s.pengim === 'a1')!
    expect(a1.clips).toEqual([{ url: 'https://a.example/1', speaker: 'x' }, { url: 'https://a.example/2' }])
  })

  it('gives a syllable with no recorded clips an empty list, not undefined', () => {
    const data = buildSounds(
      [entry({ id: 'a', headword: '阿', readings: [{ pengim: 'a1', variety: 'chaozhou' }] })],
      undefined,
      null,
    )
    const a1 = data.sounds.find((s) => s.pengim === 'a1')!
    expect(a1.clips).toEqual([])
  })

  it('decomposes initial/rime/tone via parseSyllable (issue #171)', () => {
    const data = buildSounds([
      entry({ id: 'a', headword: '潮', readings: [{ pengim: 'dio5', variety: 'chaozhou' }] }),
    ])
    const dio5 = data.sounds.find((s) => s.pengim === 'dio5')!
    expect(dio5.initial).toBe('d')
    expect(dio5.rime).toBe('io')
    expect(dio5.tone).toBe(5)
  })

  it('gives a zero-initial syllable a null initial', () => {
    const data = buildSounds([entry({ id: 'a', headword: '阿', readings: [{ pengim: 'a1', variety: 'chaozhou' }] })])
    const a1 = data.sounds.find((s) => s.pengim === 'a1')!
    expect(a1.initial).toBeNull()
    expect(a1.rime).toBe('a')
    expect(a1.tone).toBe(1)
  })
})
