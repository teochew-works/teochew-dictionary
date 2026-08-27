import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFullAudioOnly, writeFullAudioOnly } from './fullAudioOnly'

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
