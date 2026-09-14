import { combineAxes, type AttestedTriple, type AxisCandidates, type CombineAxesOptions, type CombinedCandidate } from './combine.js'
import { contourDistance } from './tone.js'
import { dtwDistance } from './dtw.js'
import { DEFAULT_SEGMENT_PARAMS, segmentFrames, type SegmentParams } from './segment.js'

export interface AxisReferenceClip {
  initial: string
  rime: string
  tone: number
  /** Whether the rime's nucleus is nasalised (a trailing `-n` marker, not the `-ng` coda) — issue #280's follow-up rime gating needs this alongside `coda` to tell a same-structural-class reference from a different one. */
  nasalised: boolean
  /** The rime's coda, or null for an open syllable: `'ng'` (nasal), one of the checked codas (`'b'`/`'g'`/`'h'`), or null. */
  coda: string | null
  mfcc: number[][]
  onsetMs: number | null
  f0Contour: number[] | null
}

export interface AxisQuery {
  mfcc: number[][]
  onsetMs: number | null
  f0Contour: number[] | null
}

/**
 * Per-axis inclusion filters — restricts which references are allowed to
 * contribute a candidate on that axis (issue #280's follow-up). Excluding a
 * reference skips its distance computation entirely, not just its result.
 *
 * Only valid when the query's true label is already known — checking a
 * clip against its own claimed syllable (training-data QC, or verifying
 * synthesised output against its intended target, #260), never for a blind
 * mic query: gating tone candidates by the true tone's own checkedness, or
 * rime candidates by the true rime's own nasalisation/coda class, would be
 * circular if that's exactly what's being guessed.
 */
export interface AxisFilters {
  initial?: (ref: AxisReferenceClip) => boolean
  rime?: (ref: AxisReferenceClip) => boolean
  tone?: (ref: AxisReferenceClip) => boolean
}

/**
 * Per-axis distance adjustment — unlike `AxisFilters`' hard exclude, this
 * nudges a candidate's distance rather than ruling it out (issue #280's
 * blind-classification follow-up). For gating by an *estimated* property
 * (e.g. tone checkedness guessed from the query's own active duration,
 * `estimateChecked` — never a certainty the way a known QC target is), a
 * hard exclude risks throwing out the correct answer over a wrong guess;
 * a penalty only disadvantages it, and a strong enough acoustic match can
 * still win.
 */
export interface AxisAdjustments {
  tone?: (ref: AxisReferenceClip, distance: number) => number
}

export interface ComputeAxisCandidatesOptions {
  params?: SegmentParams
  /**
   * Segmentation params to use for one reference's own clip, in place of
   * `params` — e.g. a fallback initial-window length chosen by that
   * reference's own (known) manner class, rather than one fixed window for
   * every onset-detection failure regardless of whether it's a sonorant or
   * a weakly-voiced stop (issue #280's follow-up). The query itself always
   * segments with `params`, since its manner class is exactly what's being
   * classified. Defaults to `params` for every reference.
   */
  referenceParams?: (ref: AxisReferenceClip) => SegmentParams
  filters?: AxisFilters
  adjustments?: AxisAdjustments
}

function keepMin(m: Map<string, number>, key: string, distance: number): void {
  const prev = m.get(key)
  if (prev === undefined || distance < prev) m.set(key, distance)
}

function toRanked(m: Map<string, number>): { key: string; distance: number }[] {
  return [...m].map(([key, distance]) => ({ key, distance }))
}

/**
 * The three independent axis rankings for one query against a reference
 * bank — initial/rime by DTW distance over the segmented MFCC, tone by
 * contour distance — each reduced to the minimum distance per axis label
 * (plain nearest-neighbor within class, not DTW-barycenter prototypes;
 * issue #280's own scoping choice). Exposed separately from `classifyAxes`
 * so a caller that wants each axis's own best guess (e.g. held-out per-axis
 * accuracy) doesn't have to re-derive it from the combined ranking.
 */
export function computeAxisCandidates(
  query: AxisQuery,
  references: AxisReferenceClip[],
  options: ComputeAxisCandidatesOptions = {},
): AxisCandidates {
  const { params = DEFAULT_SEGMENT_PARAMS, referenceParams, filters, adjustments } = options
  const querySeg = segmentFrames(query.mfcc, query.onsetMs, params)

  const initialBest = new Map<string, number>()
  const rimeBest = new Map<string, number>()
  const toneBest = new Map<string, number>()

  for (const ref of references) {
    const refSeg = segmentFrames(ref.mfcc, ref.onsetMs, referenceParams ? referenceParams(ref) : params)
    if (!filters?.initial || filters.initial(ref)) {
      keepMin(initialBest, ref.initial, dtwDistance(querySeg.initial, refSeg.initial))
    }
    if (!filters?.rime || filters.rime(ref)) {
      keepMin(rimeBest, ref.rime, dtwDistance(querySeg.rime, refSeg.rime))
    }
    if (query.f0Contour && ref.f0Contour && (!filters?.tone || filters.tone(ref))) {
      const raw = contourDistance(query.f0Contour, ref.f0Contour)
      keepMin(toneBest, String(ref.tone), adjustments?.tone ? adjustments.tone(ref, raw) : raw)
    }
  }

  return { initial: toRanked(initialBest), rime: toRanked(rimeBest), tone: toRanked(toneBest) }
}

/**
 * Ranks a query against a reference bank by combining the three independent
 * axis rankings via `combineAxes` (issue #280) — the full pipeline, shared
 * by the Node CLI/eval and the browser's `MicSearchButton` so both call the
 * exact same classification logic instead of two implementations drifting
 * apart.
 */
export function classifyAxes(
  query: AxisQuery,
  references: AxisReferenceClip[],
  attested: AttestedTriple[],
  options: ComputeAxisCandidatesOptions = {},
  combineOptions: CombineAxesOptions = {},
): CombinedCandidate[] {
  return combineAxes(attested, computeAxisCandidates(query, references, options), combineOptions)
}
