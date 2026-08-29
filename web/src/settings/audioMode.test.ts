import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAudioMode, writeAudioMode } from './audioMode'

describe('readAudioMode / writeAudioMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to both when nothing is stored', () => {
    expect(readAudioMode()).toBe('both')
  })

  it('round-trips each mode', () => {
    for (const mode of ['component', 'combined', 'both'] as const) {
      writeAudioMode(mode)
      expect(readAudioMode()).toBe(mode)
    }
  })

  it('falls back to the default on an invalid stored value', () => {
    localStorage.setItem('teochew-dictionary:audio-mode', 'not-a-real-mode')
    expect(readAudioMode()).toBe('both')
  })
})
