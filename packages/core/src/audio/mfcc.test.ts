import { describe, expect, it } from 'vitest'
import { activeBounds, DEFAULT_MFCC_PARAMS, extractMfccFromSamples, type MfccParams } from './mfcc.js'

const SR = 48_000

/** A harmonic tone, matching the Python test suite's `tone()` helper — WORLD-style
 * trackers (and, incidentally, MFCC's spectral shape) want harmonics, not a bare sine. */
function tone(freqHz: number, ms: number, sr: number = SR): Float64Array {
  const n = Math.floor((sr * ms) / 1000)
  const x = new Float64Array(n)
  for (let k = 1; k <= 7; k += 1) {
    for (let i = 0; i < n; i += 1) x[i]! += Math.sin((2 * Math.PI * freqHz * k * i) / sr) / k
  }
  const max = Math.max(...Array.from(x, Math.abs))
  for (let i = 0; i < n; i += 1) x[i] = (0.3 * x[i]!) / max
  return x
}

function silence(ms: number, sr: number = SR): Float64Array {
  return new Float64Array(Math.floor((sr * ms) / 1000))
}

function concat(...parts: Float64Array[]): Float64Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Float64Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

describe('activeBounds', () => {
  it('bounds a clip with leading/trailing silence', () => {
    const x = concat(silence(200), tone(150, 400), silence(150))
    const [start, end] = activeBounds(x, SR, -30)
    expect(start).toBeCloseTo(200, -1)
    expect(end).toBeCloseTo(600, -1)
  })

  it('returns the whole clip for pure silence', () => {
    const x = silence(300)
    expect(activeBounds(x, SR, -30)).toEqual([0, 300])
  })
})

describe('extractMfccFromSamples', () => {
  it('matches the hop-count arithmetic over the trimmed active region', () => {
    const params: MfccParams = DEFAULT_MFCC_PARAMS
    const x = concat(silence(200), tone(150, 400), silence(150))
    const frames = extractMfccFromSamples(x, SR, params)

    const [startMs, endMs] = activeBounds(x, SR, params.silenceDb)
    const activeSamples = Math.round((endMs * SR) / 1000) - Math.floor((startMs * SR) / 1000)
    const frameLen = Math.round((SR * params.frameMs) / 1000)
    const hopLen = Math.round((SR * params.hopMs) / 1000)
    const expected = 1 + Math.floor((activeSamples - frameLen) / hopLen)

    expect(frames.length).toBe(expected)
  })

  it('returns frames of shape [n][nMfcc]', () => {
    const params: MfccParams = { ...DEFAULT_MFCC_PARAMS, nMfcc: 13 }
    const frames = extractMfccFromSamples(tone(150, 300), SR, params)
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((f) => f.length === params.nMfcc)).toBe(true)
  })

  it('yields exactly one frame for a sub-frame-length clip, without crashing', () => {
    const frames = extractMfccFromSamples(tone(150, 10), SR)
    expect(frames.length).toBe(1)
  })

  it('does not crash on pure silence', () => {
    const frames = extractMfccFromSamples(silence(300), SR)
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((f) => f.every((v) => Number.isFinite(v)))).toBe(true)
  })

  it('trims leading silence before framing, so a padded clip lands close to an unpadded one', () => {
    const plain = concat(silence(50), tone(150, 400), silence(50))
    const padded = concat(silence(300), tone(150, 400), silence(50))
    const plainFrames = extractMfccFromSamples(plain, SR)
    const paddedFrames = extractMfccFromSamples(padded, SR)
    expect(Math.abs(plainFrames.length - paddedFrames.length)).toBeLessThanOrEqual(2)
  })

  it('separates octave-apart tones by more than an identical re-synthesis of the same tone', () => {
    const low = extractMfccFromSamples(tone(150, 300), SR)
    const lowAgain = extractMfccFromSamples(tone(150, 300), SR)
    const high = extractMfccFromSamples(tone(300, 300), SR)

    function meanDist(a: number[][], b: number[][]): number {
      const n = Math.min(a.length, b.length)
      let sum = 0
      for (let i = 0; i < n; i += 1) {
        let d = 0
        for (let k = 0; k < a[i]!.length; k += 1) d += (a[i]![k]! - b[i]![k]!) ** 2
        sum += Math.sqrt(d)
      }
      return sum / n
    }

    const sameToneDist = meanDist(low, lowAgain)
    const crossToneDist = meanDist(low, high)
    expect(sameToneDist).toBeLessThan(1e-6)
    expect(crossToneDist).toBeGreaterThan(sameToneDist)
  })
})
