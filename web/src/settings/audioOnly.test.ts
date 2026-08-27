import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAudioOnly, writeAudioOnly } from './audioOnly'

describe('readAudioOnly / writeAudioOnly', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to false when nothing is stored', () => {
    expect(readAudioOnly()).toBe(false)
  })

  it('round-trips true', () => {
    writeAudioOnly(true)
    expect(readAudioOnly()).toBe(true)
  })

  it('round-trips false', () => {
    writeAudioOnly(true)
    writeAudioOnly(false)
    expect(readAudioOnly()).toBe(false)
  })

  it('treats an unrecognized stored value as false', () => {
    localStorage.setItem('teochew-dictionary:audio-only', 'not-a-boolean')
    expect(readAudioOnly()).toBe(false)
  })
})
