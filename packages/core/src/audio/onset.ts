/**
 * Estimated-onset gating for the initial axis (issue #280's blind-accuracy
 * follow-up) — the initial-axis counterpart to `checkedness.ts`'s tone
 * gating. `onsetMs` fans out cleanly by manner for the fricatives/affricates
 * (`h`~5ms, `k`~10ms, `t`~15ms, `z`~30ms, `c`~65ms, `s`~150ms median, this
 * corpus), but every stop, sonorant, and the zero initial cluster tightly at
 * ~0ms — so this only ever discriminates the fricative/affricate tier from
 * each other and from that cluster, never within it. Measured leave-one-out
 * gain is correspondingly small (~0.5pt top-1) — reported honestly, not
 * oversold: most of initial's confusion (the mutual `b`/`d`/`g`/`m`/`n`/`ng`/
 * zero-initial tangle) needs a genuine spectral distinction this duration
 * signal can't provide.
 */

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** A corpus statistic, not a phonological constant — recompute per corpus/speaker rather than hardcoding. */
export function computeMedianOnsetByInitial(clips: { initial: string; onsetMs: number | null }[]): Map<string, number> {
  const byInitial = new Map<string, number[]>()
  for (const clip of clips) {
    const list = byInitial.get(clip.initial) ?? []
    list.push(clip.onsetMs ?? 0)
    byInitial.set(clip.initial, list)
  }
  return new Map([...byInitial].map(([initial, values]) => [initial, median(values)]))
}

/** Chosen by sweeping leave-one-out initial accuracy: 0.005 was the best of {0, 0.005, 0.01, 0.02, 0.05, 0.1} — larger scales cost accuracy fast (0.1 nearly halves top-1). */
export const DEFAULT_ONSET_PENALTY_SCALE = 0.005

/**
 * Builds a `computeAxisCandidates` initial-axis adjustment (`adjustments.initial`)
 * from the query's own `onsetMs` and each label's typical onset duration —
 * adds a distance penalty proportional to how far a candidate's expected
 * onset is from what the query actually showed, rather than excluding it.
 */
export function estimatedOnsetAdjustment(
  queryOnsetMs: number,
  medianOnsetByInitial: ReadonlyMap<string, number>,
  scale: number = DEFAULT_ONSET_PENALTY_SCALE,
): (ref: { initial: string }, distance: number) => number {
  return (ref, distance) => {
    const expected = medianOnsetByInitial.get(ref.initial) ?? 0
    return distance + scale * Math.abs(queryOnsetMs - expected)
  }
}
