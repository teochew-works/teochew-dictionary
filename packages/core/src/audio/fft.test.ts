import { describe, expect, it } from 'vitest'
import { fftPowerSpectrum, isPowerOfTwo, nextPowerOfTwo } from './fft.js'

describe('isPowerOfTwo', () => {
  it('accepts powers of two, rejects everything else', () => {
    expect(isPowerOfTwo(1)).toBe(true)
    expect(isPowerOfTwo(2)).toBe(true)
    expect(isPowerOfTwo(1024)).toBe(true)
    expect(isPowerOfTwo(0)).toBe(false)
    expect(isPowerOfTwo(3)).toBe(false)
    expect(isPowerOfTwo(1200)).toBe(false)
  })
})

describe('nextPowerOfTwo', () => {
  it('rounds up to the next power of two, or stays put if already one', () => {
    expect(nextPowerOfTwo(1)).toBe(1)
    expect(nextPowerOfTwo(2)).toBe(2)
    expect(nextPowerOfTwo(1200)).toBe(2048)
    expect(nextPowerOfTwo(1025)).toBe(2048)
  })
})

function sine(freqHz: number, n: number, sr: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * freqHz * i) / sr))
}

describe('fftPowerSpectrum', () => {
  it('rejects a non-power-of-two nFft', () => {
    expect(() => fftPowerSpectrum([1, 2, 3], 100)).toThrow(/power of two/)
  })

  it('concentrates a constant (DC) signal entirely in bin 0', () => {
    const n = 64
    const signal = new Array<number>(n).fill(1)
    const power = fftPowerSpectrum(signal, n)
    expect(power[0]).toBeGreaterThan(0)
    for (let k = 1; k < power.length; k += 1) expect(power[k]).toBeLessThan(1e-6)
  })

  it('puts a pure tone\'s energy at the expected bin', () => {
    const sr = 8000
    const n = 256
    const freqHz = 1000 // bin = freqHz * n / sr = 32
    const signal = sine(freqHz, n, sr)
    const power = fftPowerSpectrum(signal, n)
    const expectedBin = (freqHz * n) / sr
    const peakBin = power.indexOf(Math.max(...power))
    expect(peakBin).toBe(expectedBin)
  })

  it('zero-pads a shorter signal up to nFft', () => {
    const power = fftPowerSpectrum([1, 1, 1, 1], 16)
    expect(power.length).toBe(9)
    expect(power.every((v) => Number.isFinite(v))).toBe(true)
  })
})
