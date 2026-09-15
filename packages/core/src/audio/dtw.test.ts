import { describe, expect, it } from 'vitest'
import { dtwDistance } from './dtw.js'

function sequence(...frames: number[][]): number[][] {
  return frames
}

describe('dtwDistance', () => {
  it('is zero for identical sequences', () => {
    const a = sequence([1, 2, 3], [4, 5, 6], [7, 8, 9])
    expect(dtwDistance(a, a)).toBe(0)
  })

  it('is small for a time-stretched copy of the same sequence', () => {
    const a = sequence([1, 0], [2, 0], [3, 0], [4, 0])
    const stretched = sequence([1, 0], [1, 0], [2, 0], [3, 0], [4, 0])
    const unrelated = sequence([9, 9], [1, 8], [8, 1], [0, 9])

    const stretchedDist = dtwDistance(a, stretched)
    const unrelatedDist = dtwDistance(a, unrelated)
    expect(stretchedDist).toBeLessThan(0.01)
    expect(unrelatedDist).toBeGreaterThan(stretchedDist)
  })

  it("normalizes so references of very different length aren't systematically favored by raw length", () => {
    const query = sequence(...Array.from({ length: 20 }, () => [1, 1]))
    const short = sequence(...Array.from({ length: 10 }, () => [1, 1.5]))
    const long = sequence(...Array.from({ length: 50 }, () => [1, 1.5]))

    const shortDist = dtwDistance(query, short)
    const longDist = dtwDistance(query, long)
    expect(Math.abs(shortDist - longDist)).toBeLessThan(0.1)
  })

  it('honours a custom distance function', () => {
    const a = sequence([0, 0])
    const b = sequence([3, 4])
    const manhattan = (x: number[], y: number[]) => Math.abs(x[0]! - y[0]!) + Math.abs(x[1]! - y[1]!)

    expect(dtwDistance(a, b)).toBeCloseTo(2.5)
    expect(dtwDistance(a, b, manhattan)).toBeCloseTo(3.5)
  })

  it('is Infinity for an empty sequence', () => {
    expect(dtwDistance([], [[1, 2]])).toBe(Infinity)
    expect(dtwDistance([[1, 2]], [])).toBe(Infinity)
    expect(dtwDistance([], [])).toBe(Infinity)
  })
})
