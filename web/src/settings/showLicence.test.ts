import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readShowLicence, writeShowLicence } from './showLicence'

describe('readShowLicence / writeShowLicence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to true when nothing is stored', () => {
    expect(readShowLicence()).toBe(true)
  })

  it('round-trips true', () => {
    writeShowLicence(true)
    expect(readShowLicence()).toBe(true)
  })

  it('round-trips false', () => {
    writeShowLicence(true)
    writeShowLicence(false)
    expect(readShowLicence()).toBe(false)
  })

  it('treats an unrecognized stored value as false', () => {
    localStorage.setItem('teochew-dictionary:show-licence', 'not-a-boolean')
    expect(readShowLicence()).toBe(false)
  })
})
