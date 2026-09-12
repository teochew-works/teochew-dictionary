import type { Syllable } from '../phonology/syllable.js'
import type { ClipFeatures } from './features.js'
import { MIN_MEASURABLE_ONSET_MS, codaClass, hzToSemitones, median, toneCodaKey, type CorpusStats } from './grade.js'
import type { RenderInfo } from './synthesize.js'

/**
 * The rendering target for one syllable, composed from its parts' corpus
 * statistics (issue #259) — the "recombine into a syllable" half of
 * "features per part". The clip keeps its own segments; this is only what
 * varies between takes: the tone's f0 contour, the tone × coda duration,
 * the initial's unvoiced onset, and the corpus level.
 *
 * Mirrors `Target.from_json` in tools/resynth/src/resynth/synthesize.py.
 */
export interface SynthTarget {
  /** 20-point contour in Hz, the tone's point-wise median. */
  contourHz: number[]
  voicedMs: number
  /** Null keeps the clip's own onset — a voiced initial, or one the corpus can't measure. */
  onsetMs: number | null
  rmsDb: number
  peakCeilingDb?: number
  padMs?: number
  fadeMs?: number
  /** 1 renders the template exactly; lower keeps some of the clip's own movement. */
  f0Blend?: number
}

export interface TargetOptions {
  f0Blend?: number
  padMs?: number
  peakCeilingDb?: number
}

export const DEFAULT_PEAK_CEILING_DB = -1

/**
 * The corpus level target: the median, unless that leaves too little headroom
 * for the peakiest clips under the ceiling. A render is normalised by RMS and
 * then backed off if it would clip, so a target the corpus can't reach makes
 * every peaky clip land somewhere *below* it — and consistency is the whole
 * point. Median crest plus 2σ covers ~98% of clips; the rest back off, and
 * the self-check reports them.
 */
export function levelTarget(stats: CorpusStats, peakCeilingDb: number = DEFAULT_PEAK_CEILING_DB): number {
  const headroom = stats.crestDb.median + 2 * stats.crestDb.sigma
  return Math.min(stats.rmsDb.median, peakCeilingDb - headroom)
}

/**
 * Null when the corpus has no yardstick for this tone (or its contour is
 * empty) — nothing sensible to render toward. Falls back from the
 * tone × coda duration to the tone's when the coda class has no clips.
 */
export function composeTarget(stats: CorpusStats, syllable: Syllable, options: TargetOptions = {}): SynthTarget | null {
  const tone = stats.byTone[syllable.tone]
  if (!tone || tone.contourHz.length === 0 || !Number.isFinite(stats.rmsDb.median)) return null

  const voicedMs = stats.byToneCoda[toneCodaKey(syllable.tone, codaClass(syllable))]?.voicedMs.median ?? tone.voicedMs.median
  if (!Number.isFinite(voicedMs)) return null

  const onsetGroup = syllable.initial === null ? undefined : stats.byInitial[syllable.initial]?.onsetMs
  const onsetMs = onsetGroup && onsetGroup.median >= MIN_MEASURABLE_ONSET_MS ? onsetGroup.median : null

  return {
    contourHz: tone.contourHz,
    voicedMs,
    onsetMs,
    rmsDb: levelTarget(stats, options.peakCeilingDb),
    ...(options.peakCeilingDb !== undefined && { peakCeilingDb: options.peakCeilingDb }),
    ...(options.f0Blend !== undefined && { f0Blend: options.f0Blend }),
    ...(options.padMs !== undefined && { padMs: options.padMs }),
  }
}

/** How far a render landed from what it set out to do, in each group's robust σ. */
export interface RenderCheck {
  z: { f0?: number; voicedMs?: number; onsetMs?: number; rmsDb?: number }
  maxZ: number
  flags: string[]
  pass: boolean
}

export const DEFAULT_RENDER_CHECK_Z = 1.5

/**
 * The self-check: measures the render against its own intent — the template
 * contour, the durations it actually rendered (which may keep the source's
 * onset rather than the target's), and the level target — scaled by the
 * source corpus's spread for that group. Deliberately not `gradeClip`
 * against the corpus median: the level target sits below the median by
 * design (`levelTarget`), and a kept onset is not a miss.
 */
export function checkRender(
  stats: CorpusStats,
  syllable: Syllable,
  target: SynthTarget,
  info: RenderInfo,
  features: ClipFeatures,
  maxZ: number = DEFAULT_RENDER_CHECK_Z,
): RenderCheck {
  const flags: string[] = []
  const z: RenderCheck['z'] = {}

  const tone = stats.byTone[syllable.tone]
  if (features.f0.medianHz === null) {
    flags.push('no voiced frames')
  } else if (tone && tone.f0Semitones.sigma > 0) {
    const delta = hzToSemitones(features.f0.medianHz) - hzToSemitones(median(target.contourHz))
    if (Math.abs(Math.abs(delta) - 12) <= 3) flags.push(`f0 an octave ${delta < 0 ? 'below' : 'above'} the template`)
    z.f0 = delta / tone.f0Semitones.sigma
  }

  const durationSigma = stats.byToneCoda[toneCodaKey(syllable.tone, codaClass(syllable))]?.voicedMs.sigma ?? tone?.voicedMs.sigma
  if (features.voicedMs !== null && durationSigma !== undefined && durationSigma > 0) {
    z.voicedMs = (features.voicedMs - info.renderedVoicedMs) / durationSigma
  }

  // Same rule as gradeClip: an initial the corpus can't measure is no yardstick.
  const onsetGroup = syllable.initial === null ? undefined : stats.byInitial[syllable.initial]?.onsetMs
  if (info.renderedOnsetMs > 0 && features.onsetMs !== null && onsetGroup && onsetGroup.sigma > 0 && onsetGroup.median >= MIN_MEASURABLE_ONSET_MS) {
    z.onsetMs = (features.onsetMs - info.renderedOnsetMs) / onsetGroup.sigma
  }

  if (stats.rmsDb.sigma > 0) z.rmsDb = (features.rmsDb - target.rmsDb) / stats.rmsDb.sigma

  const worst = Math.max(0, ...Object.values(z).map((v) => Math.abs(v)))
  for (const [name, value] of Object.entries(z)) {
    if (Math.abs(value) > maxZ) flags.push(`${name} ${value >= 0 ? '+' : ''}${value.toFixed(1)}σ off target`)
  }
  return { z, maxZ: worst, flags, pass: flags.length === 0 }
}
