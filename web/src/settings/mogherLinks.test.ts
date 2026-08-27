import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readMogherLinks, writeMogherLinks } from './mogherLinks'

describe('readMogherLinks / writeMogherLinks', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to false when nothing is stored', () => {
    expect(readMogherLinks()).toBe(false)
  })

  it('round-trips true', () => {
    writeMogherLinks(true)
    expect(readMogherLinks()).toBe(true)
  })

  it('round-trips false', () => {
    writeMogherLinks(true)
    writeMogherLinks(false)
    expect(readMogherLinks()).toBe(false)
  })

  it('treats an unrecognized stored value as false', () => {
    localStorage.setItem('teochew-dictionary:mogher-links', 'not-a-boolean')
    expect(readMogherLinks()).toBe(false)
  })
})
