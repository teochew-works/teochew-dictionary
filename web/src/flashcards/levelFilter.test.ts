import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LEVEL_FILTER, isEligibleForLevel, readLevelFilter, writeLevelFilter } from './levelFilter'
import { makeEntry } from '../test/entryFixtures'

describe('isEligibleForLevel', () => {
  it('includes an entry whose level is in the selected set', () => {
    const entry = makeEntry({ level: 'A1' })
    expect(isEligibleForLevel(entry, new Set(['A1']))).toBe(true)
  })

  it('excludes an entry whose level is not in the selected set', () => {
    const entry = makeEntry({ level: 'A1' })
    expect(isEligibleForLevel(entry, new Set(['B1']))).toBe(false)
  })

  it('includes an entry with no level only when "untiered" is selected', () => {
    const entry = makeEntry({})
    expect(isEligibleForLevel(entry, new Set(['untiered']))).toBe(true)
    expect(isEligibleForLevel(entry, new Set(['A1']))).toBe(false)
  })

  it('excludes every entry when the selected set is empty', () => {
    expect(isEligibleForLevel(makeEntry({ level: 'A1' }), new Set())).toBe(false)
    expect(isEligibleForLevel(makeEntry({}), new Set())).toBe(false)
  })
})

describe('readLevelFilter / writeLevelFilter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to every level and untiered when nothing is stored', () => {
    expect(readLevelFilter()).toEqual(DEFAULT_LEVEL_FILTER)
  })

  it('round-trips an arbitrary subset', () => {
    writeLevelFilter(new Set(['A1', 'untiered']))
    expect(readLevelFilter()).toEqual(new Set(['A1', 'untiered']))
  })

  it('round-trips an empty set to an empty set, not the default', () => {
    writeLevelFilter(new Set())
    expect(readLevelFilter()).toEqual(new Set())
  })

  it('falls back to the default when the stored value has an unrecognized token', () => {
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'A1,bogus')
    expect(readLevelFilter()).toEqual(DEFAULT_LEVEL_FILTER)
  })
})
