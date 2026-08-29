import { describe, expect, it } from 'vitest'
import { canCombine, hasAudio, hasFullAudio } from './filters.js'
import type { AudioReference, EnrichedEntry, EnrichedReading } from '../enrichedEntry.js'

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

describe('canCombine', () => {
  const speakerA = { ...CLIP, key: 'dio5', speaker: 'a' }
  const speakerAAgain = { ...CLIP, key: 'ziu1', speaker: 'a' }
  const speakerB = { ...CLIP, key: 'ziu1', speaker: 'b' }
  const noSpeaker = { ...CLIP, key: 'ziu1' }

  it('rejects a single-syllable reading — nothing to combine', () => {
    const reading: EnrichedReading = { ...READING, syllable_count: 1, audio: [speakerA] }
    expect(canCombine(reading)).toBe(false)
  })

  it('accepts full same-speaker coverage', () => {
    expect(canCombine({ ...READING, audio: [speakerA, speakerAAgain] })).toBe(true)
  })

  it('rejects a reading with one syllable missing a clip', () => {
    expect(canCombine({ ...READING, audio: [speakerA, null] })).toBe(false)
  })

  it('rejects mixed speakers across syllables', () => {
    expect(canCombine({ ...READING, audio: [speakerA, speakerB] })).toBe(false)
  })

  it('rejects a clip with no speaker at all — no identity to match', () => {
    expect(canCombine({ ...READING, audio: [speakerA, noSpeaker] })).toBe(false)
  })

  it('reads from sandhiAudio in sandhi mode', () => {
    const reading: EnrichedReading = { ...READING, audio: [speakerA, speakerB], sandhiAudio: [speakerA, speakerAAgain] }
    expect(canCombine(reading, 'citation')).toBe(false)
    expect(canCombine(reading, 'sandhi')).toBe(true)
  })
})
