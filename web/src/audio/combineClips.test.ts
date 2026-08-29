import { describe, expect, it } from 'vitest'
import { concatenateWithCrossfade, trimSilence } from './combineClips'

describe('trimSilence', () => {
  it('trims silence padded on both sides', () => {
    const samples = new Float32Array([0, 0, 0, 0.5, 0.6, 0.5, 0, 0, 0])
    const { start, end } = trimSilence(samples, 0.02, 1)
    expect(samples.slice(start, end)).toEqual(new Float32Array([0.5, 0.6, 0.5]))
  })

  it('returns the untrimmed bounds when no window ever clears the threshold', () => {
    const samples = new Float32Array(2048).fill(0.001)
    expect(trimSilence(samples, 0.02)).toEqual({ start: 0, end: samples.length })
  })

  it('does not throw on an empty array', () => {
    expect(trimSilence(new Float32Array(0))).toEqual({ start: 0, end: 0 })
  })

  it('keeps a signal that starts at sample 0 (no leading silence to trim)', () => {
    const samples = new Float32Array([0.5, 0.5, 0.5, 0, 0, 0])
    const { start } = trimSilence(samples, 0.02, 1)
    expect(start).toBe(0)
  })
})

describe('concatenateWithCrossfade', () => {
  it('returns a single clip unchanged', () => {
    const clip = new Float32Array([1, 2, 3])
    expect(concatenateWithCrossfade([clip], 1000)).toBe(clip)
  })

  it('produces the expected total length: sum of lengths minus the shared overlap', () => {
    const a = new Float32Array(10).fill(1)
    const b = new Float32Array(10).fill(1)
    // 4ms crossfade at 1000 Hz = 4 samples.
    const result = concatenateWithCrossfade([a, b], 1000, 4)
    expect(result).toHaveLength(16)
  })

  it('does not double the amplitude across a seam between two full-amplitude clips', () => {
    const a = new Float32Array(10).fill(1)
    const b = new Float32Array(10).fill(1)
    const result = concatenateWithCrossfade([a, b], 1000, 4)
    for (const sample of result) {
      expect(sample).toBeCloseTo(1, 5)
    }
  })

  it('blends toward the next clip across the seam, not a hard cut', () => {
    const a = new Float32Array(10).fill(1)
    const b = new Float32Array(10).fill(-1)
    const result = concatenateWithCrossfade([a, b], 1000, 4)
    // Overlap region (samples 6-9, 0-indexed) should move from close-to-1
    // toward close-to--1, strictly decreasing across the seam.
    const overlap = result.slice(6, 10)
    for (let i = 1; i < overlap.length; i++) {
      expect(overlap[i]!).toBeLessThan(overlap[i - 1]!)
    }
  })

  it('clamps the crossfade to the shorter neighbour instead of reading out of bounds', () => {
    const short = new Float32Array(2).fill(1)
    const long = new Float32Array(10).fill(1)
    expect(() => concatenateWithCrossfade([short, long], 1000, 25)).not.toThrow()
    // Crossfade can be at most 2 samples (the shorter clip's full length).
    const result = concatenateWithCrossfade([short, long], 1000, 25)
    expect(result).toHaveLength(2 + 10 - 2)
  })

  it('concatenates three clips with two independent seams', () => {
    const a = new Float32Array(10).fill(1)
    const b = new Float32Array(10).fill(1)
    const c = new Float32Array(10).fill(1)
    const result = concatenateWithCrossfade([a, b, c], 1000, 4)
    expect(result).toHaveLength(30 - 4 - 4)
    for (const sample of result) {
      expect(sample).toBeCloseTo(1, 5)
    }
  })
})
