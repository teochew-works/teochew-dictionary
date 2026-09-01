import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isEligibleForMode, readPromptMode, writePromptMode } from './promptMode.js'
import { makeEntry, makeReading } from '../test/entryFixtures.js'
import type { AudioReference } from '../enrichedEntry.js'

const WORD_CLIP: AudioReference = {
  key: 'dio5 ziu1',
  url: 'https://example.com/dio5-ziu1.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: [],
}

describe('isEligibleForMode', () => {
  it('chinese mode accepts any entry', () => {
    expect(isEligibleForMode(makeEntry({ readings: [], senses: [] }), 'chinese')).toBe(true)
  })

  it('pronunciation mode requires at least one reading', () => {
    expect(isEligibleForMode(makeEntry(), 'pronunciation')).toBe(true)
    expect(isEligibleForMode(makeEntry({ readings: [] }), 'pronunciation')).toBe(false)
  })

  it('english mode requires a non-empty gloss on the first sense', () => {
    expect(isEligibleForMode(makeEntry(), 'english')).toBe(true)
    expect(isEligibleForMode(makeEntry({ senses: [{ pos: 'noun', gloss_en: [] }] }), 'english')).toBe(false)
    expect(isEligibleForMode(makeEntry({ senses: [] }), 'english')).toBe(false)
  })

  it('audio-only mode requires a clip on readings[0] specifically, not just anywhere on the entry', () => {
    const noClip = makeEntry()
    expect(isEligibleForMode(noClip, 'audio-only')).toBe(false)

    const clipOnFirstReading = makeEntry({ readings: [makeReading({ wordAudio: WORD_CLIP })] })
    expect(isEligibleForMode(clipOnFirstReading, 'audio-only')).toBe(true)

    const clipOnSecondReadingOnly = makeEntry({
      readings: [makeReading(), makeReading({ wordAudio: WORD_CLIP })],
    })
    expect(isEligibleForMode(clipOnSecondReadingOnly, 'audio-only')).toBe(false)
  })

  it('audio-only mode also accepts a syllable-level clip on readings[0]', () => {
    const syllableClipOnly = makeEntry({ readings: [makeReading({ audio: [WORD_CLIP, null] })] })
    expect(isEligibleForMode(syllableClipOnly, 'audio-only')).toBe(true)
  })
})

describe('readPromptMode / writePromptMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to chinese when nothing is stored', () => {
    expect(readPromptMode()).toBe('chinese')
  })

  it('round-trips a written mode', () => {
    writePromptMode('audio-only')
    expect(readPromptMode()).toBe('audio-only')
  })

  it('falls back to the default on an invalid stored value', () => {
    localStorage.setItem('teochew-dictionary:flashcard-prompt-mode', 'not-a-real-mode')
    expect(readPromptMode()).toBe('chinese')
  })
})
