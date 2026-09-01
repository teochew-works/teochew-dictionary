import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPronunciationMode, writePronunciationMode } from './pronunciationMode.js'

describe('readPronunciationMode / writePronunciationMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to sandhi when nothing is stored', () => {
    expect(readPronunciationMode()).toBe('sandhi')
  })

  it('round-trips a written mode', () => {
    writePronunciationMode('citation')
    expect(readPronunciationMode()).toBe('citation')
  })

  it('falls back to the default on an invalid stored value', () => {
    localStorage.setItem('teochew-dictionary:pronunciation-mode', 'not-a-real-mode')
    expect(readPronunciationMode()).toBe('sandhi')
  })
})
