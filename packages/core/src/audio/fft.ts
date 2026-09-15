/**
 * A minimal FFT for the MFCC pipeline (issue #279's speak-to-search feature).
 * Pure array math, no dependency — mirrors what `np.fft.rfft` gives the
 * Python side of the same pipeline (`tools/resynth/src/resynth/mfcc.py`),
 * since a browser has no numpy to call into.
 */

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

export function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < Math.max(n, 1)) p <<= 1
  return p
}

/** In-place iterative radix-2 Cooley-Tukey FFT. `re`/`im` must share a power-of-two length. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tempRe = re[i]!
      re[i] = re[j]!
      re[j] = tempRe
      const tempIm = im[i]!
      im[i] = im[j]!
      im[j] = tempIm
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len / 2
    const angle = (-2 * Math.PI) / len
    const wr = Math.cos(angle)
    const wi = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let curWr = 1
      let curWi = 0
      for (let j = 0; j < half; j += 1) {
        const uRe = re[i + j]!
        const uIm = im[i + j]!
        const vRe = re[i + j + half]! * curWr - im[i + j + half]! * curWi
        const vIm = re[i + j + half]! * curWi + im[i + j + half]! * curWr
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + half] = uRe - vRe
        im[i + j + half] = uIm - vIm
        const nextWr = curWr * wr - curWi * wi
        const nextWi = curWr * wi + curWi * wr
        curWr = nextWr
        curWi = nextWi
      }
    }
  }
}

/**
 * Power spectrum of `signal` (zero-padded or truncated to `nFft`, which must
 * be a power of two) over the non-negative-frequency bins `[0, nFft/2]` —
 * equivalent to `np.abs(np.fft.rfft(signal, n=nFft)) ** 2`.
 */
export function fftPowerSpectrum(signal: ArrayLike<number>, nFft: number): Float64Array {
  if (!isPowerOfTwo(nFft)) throw new Error(`nFft must be a power of two, got ${nFft}`)

  const re = new Float64Array(nFft)
  const im = new Float64Array(nFft)
  const n = Math.min(signal.length, nFft)
  for (let i = 0; i < n; i += 1) re[i] = signal[i]!
  fftInPlace(re, im)

  const nBins = nFft / 2 + 1
  const power = new Float64Array(nBins)
  for (let k = 0; k < nBins; k += 1) power[k] = re[k]! * re[k]! + im[k]! * im[k]!
  return power
}
