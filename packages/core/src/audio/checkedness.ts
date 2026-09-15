/**
 * Estimates whether a clip's tone is checked (入聲 — requires a stop coda)
 * purely from its active (non-silent) duration, no target label needed
 * (issue #280's blind-classification follow-up). A checked syllable is cut
 * short by its stop closure — no vowel-decay tail — so it runs measurably
 * shorter than an unchecked one; a single threshold on `activeMs` scores
 * 94.3% leave-one-out accuracy over the `jky` corpus (82.0% majority-class
 * baseline), found by sweeping every candidate WORLD-feature summary
 * against ground truth.
 *
 * `activeMs` needs no WORLD pass — it's exactly what `activeBounds` (this
 * module's neighbour, `mfcc.ts`) already computes to trim silence before
 * framing, numerically parallel to the Python offline extractor's own
 * `active_bounds_ms`. That means this estimator runs identically on a
 * cached reference clip and on a live microphone query, unlike the
 * checkedness-from-label gating in `combine.ts`'s `AxisFilters`, which only
 * ever applies when the target is already known.
 */

/** Chosen by sweeping held-out accuracy, not a phonological constant — see the module doc. */
export const DEFAULT_CHECKED_ACTIVE_MS_THRESHOLD = 515

export function estimateChecked(activeMs: number, thresholdMs: number = DEFAULT_CHECKED_ACTIVE_MS_THRESHOLD): boolean {
  return activeMs <= thresholdMs
}

/**
 * Chosen by sweeping leave-one-out tone accuracy against several penalty
 * magnitudes: 78.6% -> 87.4% top-1 (98.3% -> 98.4% top-3, 99.7% -> 99.7%
 * top-5) — a larger penalty (0.1) buys another ~0.4pt of top-1 but costs
 * noticeably more top-3/top-5, and much larger penalties (0.5+) plateau,
 * acting as a near-hard-exclude. 0.05 was the best overall balance.
 */
export const DEFAULT_CHECKEDNESS_PENALTY = 0.05

/**
 * Builds a `computeAxisCandidates` tone-axis adjustment (its `adjustments.tone`)
 * from an *estimated* checkedness — `estimateChecked`'s guess, not a known
 * target — adding `penalty` to a candidate's distance when its own
 * checkedness disagrees with the estimate, rather than excluding it
 * outright (`AxisFilters` is for a known target, where a hard exclude can't
 * be wrong; this can be, so it only nudges).
 */
export function estimatedCheckednessAdjustment(
  estimatedChecked: boolean,
  checkedTones: ReadonlySet<number>,
  penalty: number = DEFAULT_CHECKEDNESS_PENALTY,
): (ref: { tone: number }, distance: number) => number {
  return (ref, distance) => (checkedTones.has(ref.tone) === estimatedChecked ? distance : distance + penalty)
}
