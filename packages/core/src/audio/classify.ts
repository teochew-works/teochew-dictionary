import { combineAxes, type AttestedTriple, type AxisCandidates, type CombineAxesOptions, type CombinedCandidate } from './combine.js'
import { contourDistance } from './tone.js'
import { dtwDistance } from './dtw.js'
import { DEFAULT_SEGMENT_PARAMS, segmentFrames, type SegmentParams } from './segment.js'

export interface AxisReferenceClip {
  initial: string
  rime: string
  tone: number
  mfcc: number[][]
  onsetMs: number | null
  f0Contour: number[] | null
}

export interface AxisQuery {
  mfcc: number[][]
  onsetMs: number | null
  f0Contour: number[] | null
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
  params: SegmentParams = DEFAULT_SEGMENT_PARAMS,
): AxisCandidates {
  const querySeg = segmentFrames(query.mfcc, query.onsetMs, params)

  const initialBest = new Map<string, number>()
  const rimeBest = new Map<string, number>()
  const toneBest = new Map<string, number>()

  for (const ref of references) {
    const refSeg = segmentFrames(ref.mfcc, ref.onsetMs, params)
    keepMin(initialBest, ref.initial, dtwDistance(querySeg.initial, refSeg.initial))
    keepMin(rimeBest, ref.rime, dtwDistance(querySeg.rime, refSeg.rime))
    if (query.f0Contour && ref.f0Contour) {
      keepMin(toneBest, String(ref.tone), contourDistance(query.f0Contour, ref.f0Contour))
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
  params: SegmentParams = DEFAULT_SEGMENT_PARAMS,
  combineOptions: CombineAxesOptions = {},
): CombinedCandidate[] {
  return combineAxes(attested, computeAxisCandidates(query, references, params), combineOptions)
}
