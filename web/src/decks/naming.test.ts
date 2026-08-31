import { describe, expect, it } from 'vitest'
import { uniqueDeckName } from './naming'

describe('uniqueDeckName', () => {
  it('returns the desired name unchanged when nothing collides', () => {
    expect(uniqueDeckName([], 'Animals')).toBe('Animals')
    expect(uniqueDeckName(['Colors', 'Numbers'], 'Animals')).toBe('Animals')
  })

  it('appends " 2" on a single collision', () => {
    expect(uniqueDeckName(['Animals'], 'Animals')).toBe('Animals 2')
  })

  it('keeps incrementing past taken numbered suffixes', () => {
    expect(uniqueDeckName(['Animals', 'Animals 2'], 'Animals')).toBe('Animals 3')
    expect(uniqueDeckName(['Animals', 'Animals 2', 'Animals 3'], 'Animals')).toBe('Animals 4')
  })

  it('does not skip a number that is free even if a later one is taken', () => {
    expect(uniqueDeckName(['Animals', 'Animals 3'], 'Animals')).toBe('Animals 2')
  })
})
