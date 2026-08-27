import { describe, expect, it } from 'vitest'
import { hasAudio, hasFullAudio } from './filters'
import type { AudioReference, EnrichedEntry, EnrichedReading } from '../types/dict'

const CLIP: AudioReference = {
  key: 'dio5',
  url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/dio5.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: ['Teochew Dictionary audio (CC-BY-4.0)'],
}

const READING: EnrichedReading = {
  pengim: 'dio5 ziu1',
  variety: 'chaozhou',
  ipa: 'tie⁵⁵ tsiu³³',
  poj: 'tiô-tsiu',
  sandhi: 'dio5 ziu1',
  ipa_confidence: 'medium',
  ipa_caveats: [],
  pengim_toneless: 'dio ziu',
  syllable_count: 2,
  audio: [null, null],
  sandhiAudio: [null, null],
  wordAudio: null,
}

function entryWith(...readings: EnrichedReading[]): EnrichedEntry {
  return {
    id: 'dio5-ziu1-潮州',
    headword: '潮州',
    readings,
    senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou'] }],
    sources: ['seed'],
    search_keys: ['潮州'],
    licence: 'CC-BY-4.0',
    attributions: ['Teochew Dictionary (CC-BY-4.0)'],
  }
}

describe('hasAudio', () => {
  it('is false when every clip slot is empty — the whole dataset today', () => {
    expect(hasAudio(entryWith(READING))).toBe(false)
  })

  it('is false for an entry with no readings at all', () => {
    expect(hasAudio(entryWith())).toBe(false)
  })

  it('is true for a whole-word clip', () => {
    expect(hasAudio(entryWith({ ...READING, wordAudio: CLIP }))).toBe(true)
  })

  it('is true for a single recorded syllable', () => {
    expect(hasAudio(entryWith({ ...READING, audio: [null, CLIP] }))).toBe(true)
  })

  it('is true when only a later reading carries the clip', () => {
    expect(hasAudio(entryWith(READING, { ...READING, wordAudio: CLIP }))).toBe(true)
  })
})

describe('hasFullAudio', () => {
  it('rejects an entry with no readings', () => {
    expect(hasFullAudio(entryWith())).toBe(false)
  })

  it('accepts a whole-word clip regardless of syllable coverage', () => {
    expect(hasFullAudio(entryWith({ ...READING, wordAudio: CLIP, audio: [null, null] }))).toBe(true)
  })

  it('accepts every syllable recorded with no word clip', () => {
    expect(hasFullAudio(entryWith({ ...READING, audio: [CLIP, CLIP] }))).toBe(true)
  })

  it('rejects a partially recorded reading', () => {
    expect(hasFullAudio(entryWith({ ...READING, audio: [CLIP, null] }))).toBe(false)
  })

  it('only looks at readings[0], not a fully-recorded later reading', () => {
    const entry = entryWith({ ...READING, audio: [CLIP, null] }, { ...READING, wordAudio: CLIP })
    expect(hasFullAudio(entry)).toBe(false)
  })
})
