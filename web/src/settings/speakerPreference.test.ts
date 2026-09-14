import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SPEAKER_PREFERENCE, readSpeakerPreference, writeSpeakerPreference } from './speakerPreference'

describe('readSpeakerPreference / writeSpeakerPreference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to no preference when nothing is stored', () => {
    expect(readSpeakerPreference()).toEqual(DEFAULT_SPEAKER_PREFERENCE)
  })

  it('round-trips a written ranking and order', () => {
    writeSpeakerPreference(['jky-n', 'jky'])
    expect(readSpeakerPreference()).toEqual(['jky-n', 'jky'])
  })

  it('round-trips a single speaker', () => {
    writeSpeakerPreference(['jky'])
    expect(readSpeakerPreference()).toEqual(['jky'])
  })

  it('round-trips an explicitly-cleared (empty) ranking', () => {
    writeSpeakerPreference(['jky'])
    writeSpeakerPreference([])
    expect(readSpeakerPreference()).toEqual([])
  })

  it('falls back to the default on an invalid stored value', () => {
    localStorage.setItem('teochew-dictionary:speaker-preference', JSON.stringify([1, 2]))
    expect(readSpeakerPreference()).toEqual(DEFAULT_SPEAKER_PREFERENCE)
  })

  it('falls back to the default on malformed JSON', () => {
    localStorage.setItem('teochew-dictionary:speaker-preference', 'not json')
    expect(readSpeakerPreference()).toEqual(DEFAULT_SPEAKER_PREFERENCE)
  })
})
