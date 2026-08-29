import { describe, expect, it } from 'vitest'
import { computeFlipDeltas } from './flip'
import type { Rect } from './geometry'

function rect(left: number, top: number): Rect {
  return { top, bottom: top + 50, left, right: left + 100 }
}

describe('computeFlipDeltas', () => {
  it('computes the offset needed to move an item back to its before position', () => {
    const before = new Map([['a', rect(0, 0)]])
    const after = new Map([['a', rect(100, 0)]])
    expect(computeFlipDeltas(before, after)).toEqual(new Map([['a', { dx: -100, dy: 0 }]]))
  })

  it('omits items that did not move', () => {
    const before = new Map([['a', rect(0, 0)], ['b', rect(100, 0)]])
    const after = new Map([['a', rect(0, 0)], ['b', rect(200, 0)]])
    const deltas = computeFlipDeltas(before, after)
    expect(deltas.has('a')).toBe(false)
    expect(deltas.get('b')).toEqual({ dx: -100, dy: 0 })
  })

  it('omits an item present in before but not after', () => {
    const before = new Map([['a', rect(0, 0)], ['gone', rect(50, 0)]])
    const after = new Map([['a', rect(0, 0)]])
    expect(computeFlipDeltas(before, after).size).toBe(0)
  })

  it('computes both x and y deltas', () => {
    const before = new Map([['a', rect(0, 0)]])
    const after = new Map([['a', rect(50, 30)]])
    expect(computeFlipDeltas(before, after).get('a')).toEqual({ dx: -50, dy: -30 })
  })
})
