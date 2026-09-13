import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSpeakToSearch, writeSpeakToSearch } from './speakToSearch'

describe('readSpeakToSearch / writeSpeakToSearch', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to false when nothing is stored', () => {
    expect(readSpeakToSearch()).toBe(false)
  })

  it('round-trips true', () => {
    writeSpeakToSearch(true)
    expect(readSpeakToSearch()).toBe(true)
  })

  it('round-trips false', () => {
    writeSpeakToSearch(true)
    writeSpeakToSearch(false)
    expect(readSpeakToSearch()).toBe(false)
  })

  it('treats an unrecognized stored value as false', () => {
    localStorage.setItem('teochew-dictionary:speak-to-search', 'not-a-boolean')
    expect(readSpeakToSearch()).toBe(false)
  })
})
