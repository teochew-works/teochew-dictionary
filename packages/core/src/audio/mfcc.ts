import { fftPowerSpectrum, nextPowerOfTwo } from './fft.js'

/**
 * Pure-JS MFCC extraction for the speak-to-search feature (issue #279's web
 * follow-up) — the same framing/mel-filterbank/DCT-II pipeline as
 * `tools/resynth/src/resynth/mfcc.py`, ported so it can run in a browser
 * (no numpy there). Kept numerically parallel to the Python version
 * deliberately: the reference bank is extracted with the Python tool at
 * build time, and a live microphone query is extracted with this module at
 * request time — the two need to land in a comparable feature space for a
 * DTW distance between them to mean anything.
 */

export interface MfccParams {
  frameMs: number
  hopMs: number
  nMels: number
  nMfcc: number
  silenceDb: number
}

/** Defaults mirror `MfccParams` in tools/resynth/src/resynth/mfcc.py. */
export const DEFAULT_MFCC_PARAMS: MfccParams = { frameMs: 25, hopMs: 10, nMels: 40, nMfcc: 13, silenceDb: -30 }

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700)
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1)
}

/** RMS per non-overlapping frame; a trailing partial frame is zero-padded. */
function frameRms(samples: Float64Array, sampleRate: number, frameMs: number): Float64Array {
  const n = Math.max(1, Math.round((sampleRate * frameMs) / 1000))
  const count = Math.ceil(samples.length / n)
  const rms = new Float64Array(count)
  for (let c = 0; c < count; c += 1) {
    let sum = 0
    for (let i = 0; i < n; i += 1) {
      const idx = c * n + i
      const v = idx < samples.length ? samples[idx]! : 0
      sum += v * v
    }
    rms[c] = Math.sqrt(sum / n)
  }
  return rms
}

/**
 * The region outside leading/trailing silence, in ms — same semantics as
 * `tools/resynth/src/resynth/audio.py`'s `active_bounds_ms`: the first and
 * last frame whose RMS is above the threshold bound the active region.
 * Returns `[0, duration]` for a clip that is silent throughout.
 */
export function activeBounds(samples: Float64Array, sampleRate: number, silenceDb: number, frameMs = 10): [number, number] {
  const rms = frameRms(samples, sampleRate, frameMs)
  const threshold = 10 ** (silenceDb / 20)
  const durationMs = (1000 * samples.length) / sampleRate

  let first = -1
  let last = -1
  for (let i = 0; i < rms.length; i += 1) {
    if (rms[i]! > threshold) {
      if (first === -1) first = i
      last = i
    }
  }
  if (first === -1) return [0, durationMs]
  return [first * frameMs, Math.min(durationMs, (last + 1) * frameMs)]
}

/** Overlapping frames, one per row. A clip shorter than one frame is zero-padded to exactly one frame. */
function frameSignal(samples: Float64Array, frameLen: number, hopLen: number): number[][] {
  const n = samples.length
  if (n < frameLen) {
    const frame = new Array<number>(frameLen).fill(0)
    for (let i = 0; i < n; i += 1) frame[i] = samples[i]!
    return [frame]
  }
  const nFrames = 1 + Math.floor((n - frameLen) / hopLen)
  const frames: number[][] = []
  for (let f = 0; f < nFrames; f += 1) {
    const start = f * hopLen
    const frame = new Array<number>(frameLen)
    for (let i = 0; i < frameLen; i += 1) frame[i] = samples[start + i]!
    frames.push(frame)
  }
  return frames
}

function hammingWindow(n: number): number[] {
  if (n <= 1) return new Array<number>(n).fill(1)
  const w = new Array<number>(n)
  for (let i = 0; i < n; i += 1) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1))
  return w
}

/**
 * Triangular mel filterbank, `nMels` rows of `nFft / 2 + 1` weights each.
 * HTK-style construction: filter edges are placed at mel-equal spacing over
 * `[0, Nyquist]` and converted back to Hz; each bin's weight is the
 * piecewise-linear triangle evaluated at that bin's actual frequency, not
 * rounded to an integer bin index — see the Python version's mfcc.py for why
 * that rounding is the classic degenerate-filter failure mode. No Slaney-style
 * area normalization, for the same reason as the Python side: this is a
 * closed system (DTW between clips run through the same extractor), so a
 * uniform per-filter gain doesn't change any ranking.
 */
function melFilterbank(sampleRate: number, nFft: number, nMels: number): number[][] {
  const nBins = nFft / 2 + 1
  const melMax = hzToMel(sampleRate / 2)
  const melPoints: number[] = []
  for (let i = 0; i < nMels + 2; i += 1) melPoints.push((melMax * i) / (nMels + 1))
  const hzPoints = melPoints.map(melToHz)
  const binFreqs: number[] = []
  for (let k = 0; k < nBins; k += 1) binFreqs.push((sampleRate / 2) * (k / (nBins - 1)))

  const fb: number[][] = []
  for (let m = 0; m < nMels; m += 1) {
    const left = hzPoints[m]!
    const center = hzPoints[m + 1]!
    const right = hzPoints[m + 2]!
    const row = new Array<number>(nBins)
    for (let k = 0; k < nBins; k += 1) {
      const f = binFreqs[k]!
      const rising = (f - left) / Math.max(center - left, 1e-12)
      const falling = (right - f) / Math.max(right - center, 1e-12)
      row[k] = Math.max(Math.min(rising, falling), 0)
    }
    fb.push(row)
  }
  return fb
}

/** Orthonormal DCT-II basis, `nMfcc` rows of `nMels` weights: `mfcc[k] = sum_n basis[k][n] * logMel[n]`. */
function dctBasis(nMfcc: number, nMels: number): number[][] {
  const basis: number[][] = []
  for (let k = 0; k < nMfcc; k += 1) {
    const row = new Array<number>(nMels)
    for (let n = 0; n < nMels; n += 1) row[n] = Math.cos((Math.PI / nMels) * (n + 0.5) * k) * Math.sqrt(2 / nMels)
    basis.push(row)
  }
  const first = basis[0]!
  for (let n = 0; n < nMels; n += 1) first[n] = first[n]! / Math.sqrt(2)
  return basis
}

/**
 * Frame-major MFCC sequence: `[nFrames][nMfcc]`. Never empty, even for a
 * silent or sub-frame-length clip. `samples` is mono PCM in `[-1, 1]`, as
 * decoded via `AudioContext.decodeAudioData` in the browser (average the
 * channels first if the source is stereo) or `soundfile` on the Python side.
 */
export function extractMfccFromSamples(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  params: MfccParams = DEFAULT_MFCC_PARAMS,
): number[][] {
  const floatSamples = samples instanceof Float64Array ? samples : Float64Array.from(samples)
  const [startMs, endMs] = activeBounds(floatSamples, sampleRate, params.silenceDb)
  const startIdx = Math.floor((startMs * sampleRate) / 1000)
  const endIdx = Math.round((endMs * sampleRate) / 1000)
  const active = floatSamples.subarray(startIdx, endIdx)

  const frameLen = Math.max(1, Math.round((sampleRate * params.frameMs) / 1000))
  const hopLen = Math.max(1, Math.round((sampleRate * params.hopMs) / 1000))
  const nFft = nextPowerOfTwo(frameLen)

  const window = hammingWindow(frameLen)
  const fb = melFilterbank(sampleRate, nFft, params.nMels)
  const basis = dctBasis(params.nMfcc, params.nMels)

  return frameSignal(active, frameLen, hopLen).map((frame) => {
    const windowed = frame.map((v, i) => v * window[i]!)
    const power = fftPowerSpectrum(windowed, nFft)
    const melEnergy = fb.map((row) => {
      let sum = 0
      for (let k = 0; k < row.length; k += 1) sum += row[k]! * (power[k]! / frameLen)
      return sum
    })
    const logMel = melEnergy.map((e) => Math.log(Math.max(e, 1e-10)))
    return basis.map((row) => row.reduce((sum, w, n) => sum + w * logMel[n]!, 0))
  })
}
