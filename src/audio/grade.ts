import { parseSyllable, type Syllable } from '../phonology/syllable.js'
import type { ClipFeatures } from './features.js'

/**
 * Per-part statistics over the corpus, and each clip's distance from them
 * (issue #259).
 *
 * Peng'im is compositional — initial × rime × tone — and so are the things
 * that vary between takes of the same speaker: pitch is a property of the
 * *tone*, duration of the tone and its *coda class* (a checked tone 4/8
 * syllable is half the length of an open one, and that is Teochew, not
 * inconsistency), the unvoiced onset of the *initial*, and level of the
 * speaker. So statistics are filed under those parts, not per syllable —
 * that is what makes them usable both as the targets `audio:synthesize`
 * renders toward and as the yardstick its self-check measures against, for
 * a syllable no other clip shares.
 *
 * Centre and spread are median and MAD-derived sigma throughout: the whole
 * point is to find the outliers, and a mean/std would let them pull the
 * yardstick toward themselves.
 */

export type CodaClass = 'open' | 'nasal' | 'stop'

export function codaClass(syllable: Syllable): CodaClass {
  if (syllable.coda === null) return 'open'
  return syllable.coda === 'm' || syllable.coda === 'n' || syllable.coda === 'ng' ? 'nasal' : 'stop'
}

/** Map key for the (tone, coda-class) duration group. */
export function toneCodaKey(tone: number, coda: CodaClass): string {
  return `${tone}:${coda}`
}

export interface Spread {
  n: number
  median: number
  /** 1.4826 × MAD — the std of a normal distribution with this MAD. Zero for n < 2. */
  sigma: number
}

export function spread(values: number[]): Spread {
  const xs = values.filter((v) => Number.isFinite(v))
  if (xs.length === 0) return { n: 0, median: NaN, sigma: 0 }
  const med = median(xs)
  const mad = median(xs.map((v) => Math.abs(v - med)))
  return { n: xs.length, median: med, sigma: xs.length < 2 ? 0 : 1.4826 * mad }
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return NaN
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export interface ToneStats {
  /** In semitones relative to `loudness`-independent 100 Hz, so a spread is a musical interval, not Hz. */
  f0Semitones: Spread
  /** Per-point median of the 20-point contours, in Hz. */
  contourHz: number[]
  voicedMs: Spread
  rmsDb: Spread
}

export interface CorpusStats {
  byTone: Record<number, ToneStats>
  /** Keyed by `toneCodaKey`. */
  byToneCoda: Record<string, { voicedMs: Spread }>
  /** Keyed by initial, '' for the zero initial. Only voiceless onsets contribute. */
  byInitial: Record<string, { onsetMs: Spread }>
  rmsDb: Spread
}

/** One graded clip: which groups it was measured against and how far it sits from each. */
export interface ClipGrade {
  key: string
  id: string
  syllable: Syllable | null
  /** Robust z-scores; absent where the clip or its group can't supply one. */
  z: { f0?: number; voicedMs?: number; onsetMs?: number; rmsDb?: number }
  maxZ: number
  /** Why this clip deserves a listen, in the order they were found. */
  flags: string[]
}

export interface CorpusGrade {
  stats: CorpusStats
  clips: ClipGrade[]
}

export interface GradeInput {
  key: string
  id: string
  features: ClipFeatures
}

export interface GradeOptions {
  /** |z| at or above which a clip is flagged. */
  outlierZ?: number
  /** Below this, a clip is flagged as barely voiced — a mis-trigger or a mis-take. */
  minVoicedRatio?: number
}

export const DEFAULT_OUTLIER_Z = 2.5
export const DEFAULT_MIN_VOICED_RATIO = 0.4

/**
 * Peng'im initials that are voiced from the start: they have no unvoiced
 * onset to measure, so they contribute nothing to `byInitial`. (The plain
 * stops b/d/g are voiceless unaspirated — their short VOT does count.)
 */
export const VOICED_INITIALS: ReadonlySet<string> = new Set(['bh', 'gh', 'm', 'n', 'ng', 'l', 'r'])

/**
 * How far (in semitones) a clip's f0 may sit from exactly one octave off its
 * tone's median and still be called an octave error rather than an outlier.
 * A pitch tracker on a ~235 ms checked syllable, or on creaky voice, locks
 * onto the sub-octave readily — and it is the corpus's most common flag, so
 * it gets named as what it is rather than reported as "−6σ".
 */
const OCTAVE_TOLERANCE_SEMITONES = 3

/**
 * An initial whose median unvoiced onset is shorter than this is not a
 * yardstick. The onset is what survives inside the active region, and the
 * −30 dB silence bound (the same `silencedetect` threshold the clip trims
 * use) sits above most aspiration: sibilants (s, c, z) measure cleanly, but
 * an aspirated stop's /ʰ/ usually falls below it and reports 0, so a group
 * like `t: 5 ± 7 ms` would flag every clip whose aspiration *was* loud
 * enough to measure. Those groups are kept in the stats for the record and
 * skipped for z-scores.
 */
export const MIN_MEASURABLE_ONSET_MS = 20

export function hzToSemitones(hz: number): number {
  return 12 * Math.log2(hz / 100)
}

function z(value: number | null | undefined, s: Spread | undefined): number | undefined {
  if (value === null || value === undefined || s === undefined || s.n < 3 || s.sigma === 0) return undefined
  return (value - s.median) / s.sigma
}

function tryParse(key: string): Syllable | null {
  try {
    return parseSyllable(key)
  } catch {
    return null
  }
}

/** Point-wise median of equal-length contours; empty for no input. */
function medianContour(contours: number[][]): number[] {
  const length = contours[0]?.length ?? 0
  return Array.from({ length }, (_, i) => median(contours.map((c) => c[i]!)))
}

export function computeCorpusStats(inputs: { syllable: Syllable; features: ClipFeatures }[]): CorpusStats {
  const byTone = new Map<number, { f0: number[]; contours: number[][]; voicedMs: number[]; rmsDb: number[] }>()
  const byToneCoda = new Map<string, number[]>()
  const byInitial = new Map<string, number[]>()
  const rmsDb: number[] = []

  for (const { syllable, features } of inputs) {
    rmsDb.push(features.rmsDb)
    const tone = byTone.get(syllable.tone) ?? { f0: [], contours: [], voicedMs: [], rmsDb: [] }
    byTone.set(syllable.tone, tone)
    tone.rmsDb.push(features.rmsDb)
    if (features.f0.medianHz !== null) tone.f0.push(hzToSemitones(features.f0.medianHz))
    if (features.f0.contour !== null) tone.contours.push(features.f0.contour)
    if (features.voicedMs !== null) {
      tone.voicedMs.push(features.voicedMs)
      const key = toneCodaKey(syllable.tone, codaClass(syllable))
      byToneCoda.set(key, [...(byToneCoda.get(key) ?? []), features.voicedMs])
    }
    if (features.onsetMs !== null && syllable.initial !== null && !VOICED_INITIALS.has(syllable.initial)) {
      byInitial.set(syllable.initial, [...(byInitial.get(syllable.initial) ?? []), features.onsetMs])
    }
  }

  const stats: CorpusStats = { byTone: {}, byToneCoda: {}, byInitial: {}, rmsDb: spread(rmsDb) }
  for (const [tone, g] of byTone) {
    stats.byTone[tone] = {
      f0Semitones: spread(g.f0),
      contourHz: medianContour(g.contours),
      voicedMs: spread(g.voicedMs),
      rmsDb: spread(g.rmsDb),
    }
  }
  for (const [key, values] of byToneCoda) stats.byToneCoda[key] = { voicedMs: spread(values) }
  for (const [initial, values] of byInitial) stats.byInitial[initial] = { onsetMs: spread(values) }
  return stats
}

export function gradeCorpus(inputs: GradeInput[], options: GradeOptions = {}): CorpusGrade {
  const { outlierZ = DEFAULT_OUTLIER_Z, minVoicedRatio = DEFAULT_MIN_VOICED_RATIO } = options
  const parsed = inputs.map((input) => ({ ...input, syllable: tryParse(input.key) }))
  const stats = computeCorpusStats(
    parsed.flatMap((p) => (p.syllable ? [{ syllable: p.syllable, features: p.features }] : [])),
  )

  const clips: ClipGrade[] = parsed.map(({ key, id, syllable, features }) => {
    const flags: string[] = []
    const zs: ClipGrade['z'] = {}
    if (syllable === null) {
      flags.push('unparseable key')
    } else {
      const tone = stats.byTone[syllable.tone]
      const f0Semitones = features.f0.medianHz === null ? null : hzToSemitones(features.f0.medianHz)
      const f0 = z(f0Semitones, tone?.f0Semitones)
      const octave = octaveError(f0Semitones, tone?.f0Semitones)
      const voicedMs = z(features.voicedMs, stats.byToneCoda[toneCodaKey(syllable.tone, codaClass(syllable))]?.voicedMs)
      const onsetGroup = syllable.initial === null ? undefined : stats.byInitial[syllable.initial]?.onsetMs
      const onsetMs = onsetGroup && onsetGroup.median >= MIN_MEASURABLE_ONSET_MS ? z(features.onsetMs, onsetGroup) : undefined
      const rmsDb = z(features.rmsDb, stats.rmsDb)
      if (f0 !== undefined) zs.f0 = f0
      if (voicedMs !== undefined) zs.voicedMs = voicedMs
      if (onsetMs !== undefined) zs.onsetMs = onsetMs
      if (rmsDb !== undefined) zs.rmsDb = rmsDb

      if (features.f0.medianHz === null) flags.push('no voiced frames')
      else if (features.voicedRatio < minVoicedRatio) flags.push(`barely voiced (${features.voicedRatio})`)
      if (octave !== null) flags.push(`f0 an octave ${octave} tone ${syllable.tone}'s median`)
      else if (f0 !== undefined && Math.abs(f0) >= outlierZ) flags.push(`f0 ${fmtZ(f0)} for tone ${syllable.tone}`)
      if (voicedMs !== undefined && Math.abs(voicedMs) >= outlierZ) flags.push(`duration ${fmtZ(voicedMs)}`)
      if (onsetMs !== undefined && Math.abs(onsetMs) >= outlierZ) flags.push(`onset ${fmtZ(onsetMs)} for '${syllable.initial}'`)
      if (rmsDb !== undefined && Math.abs(rmsDb) >= outlierZ) flags.push(`level ${fmtZ(rmsDb)}`)
    }
    const maxZ = Math.max(0, ...Object.values(zs).map((v) => Math.abs(v)))
    return { key, id, syllable, z: zs, maxZ, flags }
  })

  return { stats, clips }
}

/** 'below' / 'above' when `semitones` sits within tolerance of ±12 from the group median, else null. */
function octaveError(semitones: number | null, s: Spread | undefined): 'below' | 'above' | null {
  if (semitones === null || s === undefined || s.n < 3) return null
  const delta = semitones - s.median
  if (Math.abs(delta + 12) <= OCTAVE_TOLERANCE_SEMITONES) return 'below'
  if (Math.abs(delta - 12) <= OCTAVE_TOLERANCE_SEMITONES) return 'above'
  return null
}

function fmtZ(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}σ`
}
