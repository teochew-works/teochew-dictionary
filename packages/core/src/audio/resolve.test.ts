import { describe, expect, it } from 'vitest'
import { collectSpeakers, pickClip, resolveEntryAudio, resolveReadingAudio } from './resolve.js'
import type { AudioReference, EnrichedEntry, EnrichedReading } from '../enrichedEntry.js'

function clip(speaker: string | undefined, key = 'dio5'): AudioReference {
  return {
    key,
    url: `https://example.test/${key}-${speaker ?? 'none'}.opus`,
    confidence: 'high',
    speaker,
    licence: 'CC-BY-4.0',
    attributions: [],
  }
}

function reading(overrides: Partial<EnrichedReading> = {}): EnrichedReading {
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
    audio: [[], []],
    sandhiAudio: [[], []],
    wordAudio: [],
    ...overrides,
  }
}

function entry(overrides: Partial<EnrichedEntry> = {}): EnrichedEntry {
  return {
    id: 'dio5-ziu1-潮州',
    headword: '潮州',
    readings: [reading()],
    senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou'] }],
    sources: ['seed'],
    search_keys: ['潮州'],
    licence: 'CC-BY-4.0',
    attributions: [],
    ...overrides,
  }
}

describe('pickClip', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickClip([], ['jky'])).toBeNull()
  })

  it('falls back to the first candidate when preference is empty', () => {
    const a = clip('jky')
    const b = clip('jky-n')
    expect(pickClip([a, b], [])).toBe(a)
  })

  it('falls back to the first candidate when none of the preference matches', () => {
    const a = clip('jky')
    expect(pickClip([a], ['someone-else'])).toBe(a)
  })

  it('picks the first-ranked preferred speaker present, regardless of default order', () => {
    const jky = clip('jky')
    const jkyN = clip('jky-n')
    expect(pickClip([jky, jkyN], ['jky-n', 'jky'])).toBe(jkyN)
  })

  it('skips a ranked speaker absent from this slot and tries the next', () => {
    const jky = clip('jky')
    expect(pickClip([jky], ['someone-else', 'jky'])).toBe(jky)
  })
})

describe('resolveReadingAudio', () => {
  it('resolves audio and wordAudio slot-by-slot via pickClip', () => {
    const jky = clip('jky', 'dio5')
    const jkyN = clip('jky-n', 'dio5')
    const word = clip('jky', 'dio5 ziu1')
    const r = reading({
      audio: [[jky, jkyN], []],
      sandhiAudio: [[], []],
      wordAudio: [word],
    })
    const resolved = resolveReadingAudio(r, ['jky-n'])
    expect(resolved.audio).toEqual([jkyN, null])
    expect(resolved.wordAudio).toBe(word)
  })

  it('falls back an empty sandhi slot to the citation slot candidates at that index', () => {
    const citationJky = clip('jky', 'dio5')
    const citationJkyN = clip('jky-n', 'dio5')
    const r = reading({
      audio: [[citationJky, citationJkyN]],
      sandhiAudio: [[]],
      wordAudio: [],
    })
    expect(resolveReadingAudio(r, ['jky-n']).sandhiAudio).toEqual([citationJkyN])
  })

  it('prefers a sandhi-specific candidate over the citation fallback when one exists', () => {
    const sandhiJkyN = clip('jky-n', 'dio7')
    const r = reading({
      audio: [[clip('jky', 'dio5')]],
      sandhiAudio: [[sandhiJkyN]],
      wordAudio: [],
    })
    expect(resolveReadingAudio(r, ['jky-n']).sandhiAudio).toEqual([sandhiJkyN])
  })
})

describe('resolveEntryAudio', () => {
  it('resolves every reading on the entry', () => {
    const jkyN = clip('jky-n')
    const e = entry({ readings: [reading({ audio: [[clip('jky'), jkyN]] })] })
    expect(resolveEntryAudio(e, ['jky-n']).readings[0]!.audio).toEqual([jkyN])
  })
})

describe('collectSpeakers', () => {
  it('collects distinct speakers across audio, sandhiAudio and wordAudio, sorted', () => {
    const e = entry({
      readings: [
        reading({
          audio: [[clip('jky')], [clip('zed')]],
          sandhiAudio: [[clip('jky-n')], []],
          wordAudio: [clip('jky')],
        }),
      ],
    })
    expect(collectSpeakers([e])).toEqual(['jky', 'jky-n', 'zed'])
  })

  it('ignores clips with no speaker', () => {
    const e = entry({ readings: [reading({ audio: [[clip(undefined)]] })] })
    expect(collectSpeakers([e])).toEqual([])
  })

  it('returns an empty list for no entries', () => {
    expect(collectSpeakers([])).toEqual([])
  })
})
