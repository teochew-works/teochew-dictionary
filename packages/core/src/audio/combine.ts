/**
 * Combines three independent axis rankings (initial, rime, tone) into one
 * full-syllable ranking, restricted to attested `(initial, rime, tone)`
 * triples (issue #280) — scoring every attested combination and returning
 * the best rather than taking each axis's independent argmin, which can
 * land on a syllable nobody ever says. Framework-agnostic (no Node/DOM
 * APIs) so the Node CLI and the browser's `MicSearchButton` call the exact
 * same combination logic instead of two implementations drifting apart.
 */

export interface RankedCandidate {
  key: string
  distance: number
}

/** One syllable actually attested in the lexicon, factored into its axes — see `src/audio/attested-triples.ts` (built from `dist/sounds.json`'s `Sound[]`, already shipped to the browser for the Sounds tab). */
export interface AttestedTriple {
  syllable: string
  initial: string
  rime: string
  tone: number
}

export interface AxisCandidates {
  /** Per-label distance: one entry per initial actually present among the reference exemplars, each the minimum distance among that label's exemplars (plain nearest-neighbor within class). */
  initial: RankedCandidate[]
  rime: RankedCandidate[]
  /** Keyed by tone number as a string, e.g. `'1'`..`'8'`. */
  tone: RankedCandidate[]
}

export interface CombinedCandidate {
  syllable: string
  initial: string
  rime: string
  tone: number
  /** Summed min-max-normalised per-axis distance — lower is better, not itself a probability. */
  distance: number
  /**
   * Relative confidence among the closest `scoreWindow` candidates (softmax
   * over `-distance`, sums to 1 across that window; 0 outside it) — a
   * comparison tool for a UI or CLI ("72% deng1, 15% deng3, …"), not a
   * calibrated probability: it says nothing about how likely the query is
   * to be any attested syllable at all, only how this candidate compares to
   * the others near the top. Scoped to a window rather than every attested
   * triple (thousands, in this corpus) — spreading softmax mass across all
   * of them makes even the best match's share negligible.
   */
  score: number
}

function minMaxNormalize(values: number[]): (v: number) => number {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return () => 0
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const range = max - min
  return (v) => (Number.isFinite(v) ? (range === 0 ? 0 : (v - min) / range) : 1)
}

function toDistanceMap(candidates: RankedCandidate[]): Map<string, number> {
  return new Map(candidates.map((c) => [c.key, c.distance]))
}

const DEFAULT_SCORE_WINDOW = 20

/** How heavily each axis's normalised distance counts toward the combined sum — equal by default. Some axes are simply more discriminative than others (tone's contour is a stronger signal than a short initial segment), so a caller that knows this from its own held-out eval can weight accordingly. */
export interface AxisWeights {
  initial: number
  rime: number
  tone: number
}

const DEFAULT_WEIGHTS: AxisWeights = { initial: 1, rime: 1, tone: 1 }

export interface CombineAxesOptions {
  scoreWindow?: number
  weights?: AxisWeights
}

export function combineAxes(
  attested: AttestedTriple[],
  axes: AxisCandidates,
  options: CombineAxesOptions = {},
): CombinedCandidate[] {
  const { scoreWindow = DEFAULT_SCORE_WINDOW, weights = DEFAULT_WEIGHTS } = options
  const initialByLabel = toDistanceMap(axes.initial)
  const rimeByLabel = toDistanceMap(axes.rime)
  const toneByLabel = toDistanceMap(axes.tone)
  const normInitial = minMaxNormalize(axes.initial.map((c) => c.distance))
  const normRime = minMaxNormalize(axes.rime.map((c) => c.distance))
  const normTone = minMaxNormalize(axes.tone.map((c) => c.distance))

  const scored = attested.flatMap((triple) => {
    const initialDist = initialByLabel.get(triple.initial)
    const rimeDist = rimeByLabel.get(triple.rime)
    const toneDist = toneByLabel.get(String(triple.tone))
    if (initialDist === undefined || rimeDist === undefined || toneDist === undefined) return []
    const distance =
      weights.initial * normInitial(initialDist) + weights.rime * normRime(rimeDist) + weights.tone * normTone(toneDist)
    return [{ syllable: triple.syllable, initial: triple.initial, rime: triple.rime, tone: triple.tone, distance }]
  })
  scored.sort((a, b) => a.distance - b.distance)

  const windowWeights = scored.slice(0, scoreWindow).map((c) => Math.exp(-c.distance))
  const totalWeight = windowWeights.reduce((sum, w) => sum + w, 0)
  return scored.map((c, i) => ({
    ...c,
    score: i < scoreWindow && totalWeight > 0 ? windowWeights[i]! / totalWeight : 0,
  }))
}
