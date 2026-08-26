import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hasFullAudio, readFullAudioOnly, writeFullAudioOnly } from './audioFilter'
import { makeEntry, makeReading } from '../test/entryFixtures'
import type { AudioReference } from '../types/dict'

const CLIP: AudioReference = {
  key: 'dio5',
  url: 'https://example.com/dio5.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: [],
}

describe('hasFullAudio', () => {
  it('rejects an entry with no readings', () => {
    expect(hasFullAudio(makeEntry({ readings: [] }))).toBe(false)
  })

  it('accepts a whole-word clip regardless of syllable coverage', () => {
    const entry = makeEntry({ readings: [makeReading({ wordAudio: CLIP, audio: [null, null] })] })
    expect(hasFullAudio(entry)).toBe(true)
  })

  it('accepts every syllable recorded with no word clip', () => {
    const entry = makeEntry({ readings: [makeReading({ audio: [CLIP, CLIP] })] })
    expect(hasFullAudio(entry)).toBe(true)
  })

  it('rejects a partially recorded reading', () => {
    const entry = makeEntry({ readings: [makeReading({ audio: [CLIP, null] })] })
    expect(hasFullAudio(entry)).toBe(false)
  })

  it('only looks at readings[0], not a fully-recorded later reading', () => {
    const entry = makeEntry({
      readings: [makeReading({ audio: [CLIP, null] }), makeReading({ wordAudio: CLIP })],
    })
    expect(hasFullAudio(entry)).toBe(false)
  })
})

describe('readFullAudioOnly / writeFullAudioOnly', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to false when nothing is stored', () => {
    expect(readFullAudioOnly()).toBe(false)
  })

  it('round-trips true', () => {
    writeFullAudioOnly(true)
    expect(readFullAudioOnly()).toBe(true)
  })

  it('round-trips false', () => {
    writeFullAudioOnly(true)
    writeFullAudioOnly(false)
    expect(readFullAudioOnly()).toBe(false)
  })

  it('treats an unrecognized stored value as false', () => {
    localStorage.setItem('teochew-dictionary:flashcard-full-audio-only', 'not-a-boolean')
    expect(readFullAudioOnly()).toBe(false)
  })
})
