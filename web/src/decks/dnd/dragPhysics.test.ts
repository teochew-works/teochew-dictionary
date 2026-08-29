import { describe, expect, it } from 'vitest'
import { nextGhostFrame } from './dragPhysics'

describe('nextGhostFrame', () => {
  it('eases toward the target rather than snapping to it (the trailing lag)', () => {
    const next = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 100, y: 0 }, 0.1)
    expect(next.x).toBeGreaterThan(0)
    expect(next.x).toBeLessThan(100)
  })

  it('moves further per frame as dt grows, for the same target', () => {
    const small = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 100, y: 0 }, 0.02)
    const large = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 100, y: 0 }, 0.1)
    expect(large.x).toBeGreaterThan(small.x)
  })

  it('eases y the same way as x', () => {
    const next = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 0, y: 200 }, 0.1)
    expect(next.y).toBeGreaterThan(0)
    expect(next.y).toBeLessThan(200)
    expect(next.x).toBe(0)
  })

  it('tilts toward positive angle when moving right, negative when moving left', () => {
    const right = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 100, y: 0 }, 0.05)
    const left = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: -100, y: 0 }, 0.05)
    expect(right.angle).toBeGreaterThan(0)
    expect(left.angle).toBeLessThan(0)
    expect(left.angle).toBeCloseTo(-right.angle, 5)
  })

  it('clamps tilt to the maximum for a fast flick', () => {
    const next = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 100000, y: 0 }, 0.1)
    expect(next.angle).toBe(18)
  })

  it('settles toward zero tilt as the ghost catches up to a stationary target', () => {
    let frame = { x: 0, y: 0, angle: 0 }
    for (let i = 0; i < 30; i += 1) {
      frame = nextGhostFrame(frame, { x: 100, y: 0 }, 0.05)
    }
    expect(frame.x).toBeCloseTo(100, 1)
    expect(Math.abs(frame.angle)).toBeLessThan(0.5)
  })

  it('does nothing for a non-positive dt', () => {
    const current = { x: 5, y: 5, angle: 3 }
    expect(nextGhostFrame(current, { x: 100, y: 100 }, 0)).toBe(current)
    expect(nextGhostFrame(current, { x: 100, y: 100 }, -1)).toBe(current)
  })
})
