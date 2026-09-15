import { describe, expect, it } from 'vitest'
import { segmentFrames, type SegmentParams } from './segment.js'

const PARAMS: SegmentParams = { hopMs: 10, minOnsetMs: 30, fallbackWindowMs: 90 }

function frames(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => [i])
}

describe('segmentFrames', () => {
  it('splits at onsetMs when it clears minOnsetMs, rounded to the nearest frame', () => {
    // 45ms / 10ms hop = 4.5 → rounds to frame 5 (banker's-unbiased Math.round → 5).
    const { initial, rime } = segmentFrames(frames(20), 45, PARAMS)
    expect(initial).toEqual(frames(5))
    expect(rime).toEqual(frames(20).slice(5))
  })

  it('falls back to the fixed window when onsetMs is null (sonorant initial, already voiced)', () => {
    const { initial, rime } = segmentFrames(frames(20), null, PARAMS)
    expect(initial).toHaveLength(9) // 90ms / 10ms hop
    expect(rime).toHaveLength(11)
  })

  it('falls back to the fixed window when onsetMs is below minOnsetMs', () => {
    const { initial } = segmentFrames(frames(20), 5, PARAMS)
    expect(initial).toHaveLength(9)
  })

  it('clamps the boundary to the clip length rather than going out of bounds', () => {
    const { initial, rime } = segmentFrames(frames(3), 500, PARAMS)
    expect(initial).toEqual(frames(3))
    expect(rime).toEqual([])
  })

  it('handles an empty clip', () => {
    expect(segmentFrames([], null, PARAMS)).toEqual({ initial: [], rime: [] })
  })
})
