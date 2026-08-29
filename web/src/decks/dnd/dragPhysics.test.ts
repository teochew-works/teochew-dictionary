import { describe, expect, it } from 'vitest'
import { nextGhostFrame } from './dragPhysics'

const FRAME = 1 / 60

describe('nextGhostFrame', () => {
  it('moves toward the pointer without reaching it in one frame', () => {
    const next = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 100, y: 100 }, FRAME)
    expect(next.x).toBeGreaterThan(0)
    expect(next.x).toBeLessThan(100)
    expect(next.y).toBeCloseTo(next.x, 5)
  })

  it('converges on the pointer over successive frames', () => {
    let frame = { x: 0, y: 0, angle: 0 }
    for (let i = 0; i < 60; i += 1) frame = nextGhostFrame(frame, { x: 100, y: 0 }, FRAME)
    expect(frame.x).toBeCloseTo(100, 3)
  })

  it('tilts in the direction of travel', () => {
    expect(nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 60, y: 0 }, FRAME).angle).toBeGreaterThan(0)
    expect(nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: -60, y: 0 }, FRAME).angle).toBeLessThan(0)
  })

  it('clamps the tilt, so a fast flick does not spin the image', () => {
    const next = nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: 5000, y: 0 }, FRAME)
    expect(next.angle).toBe(9)
    expect(nextGhostFrame({ x: 0, y: 0, angle: 0 }, { x: -5000, y: 0 }, FRAME).angle).toBe(-9)
  })

  it('settles level once the pointer stops', () => {
    let frame = { x: 0, y: 0, angle: 8 }
    for (let i = 0; i < 60; i += 1) frame = nextGhostFrame(frame, { x: 0, y: 0 }, FRAME)
    expect(Math.abs(frame.angle)).toBeLessThan(0.01)
  })

  it('is frame-rate independent: the same elapsed time lands in the same place', () => {
    let sixty = { x: 0, y: 0, angle: 0 }
    for (let i = 0; i < 6; i += 1) sixty = nextGhostFrame(sixty, { x: 100, y: 0 }, FRAME)
    let oneTwenty = { x: 0, y: 0, angle: 0 }
    for (let i = 0; i < 12; i += 1) oneTwenty = nextGhostFrame(oneTwenty, { x: 100, y: 0 }, FRAME / 2)
    expect(oneTwenty.x).toBeCloseTo(sixty.x, 3)
  })

  it('returns the frame unchanged when no time has passed', () => {
    const frame = { x: 3, y: 4, angle: 5 }
    expect(nextGhostFrame(frame, { x: 99, y: 99 }, 0)).toBe(frame)
  })
})
