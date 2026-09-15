import { describe, expect, it } from 'vitest'
import { contourDistance } from './tone.js'

describe('contourDistance', () => {
  it('is zero for identical contours', () => {
    const a = [100, 105, 110, 120, 130]
    expect(contourDistance(a, a)).toBe(0)
  })

  it('is the same for two pairs an equal number of semitones apart, regardless of absolute Hz', () => {
    // 100→200 Hz and 200→400 Hz are both exactly one octave — log2 distance is identical.
    const low = contourDistance([100], [200])
    const high = contourDistance([200], [400])
    expect(low).toBeCloseTo(high)
  })

  it('rates a falling contour as further from a rising one than from a near-identical rise', () => {
    const rising = [100, 110, 120, 140, 160]
    const risingClose = [100, 112, 121, 139, 162]
    const falling = [160, 140, 120, 110, 100]

    expect(contourDistance(rising, risingClose)).toBeLessThan(contourDistance(rising, falling))
  })

  it('is Infinity for mismatched lengths or empty contours', () => {
    expect(contourDistance([1, 2], [1])).toBe(Infinity)
    expect(contourDistance([], [])).toBe(Infinity)
  })
})
