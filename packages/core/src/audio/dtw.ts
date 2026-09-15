export type DistanceFn = (x: number[], y: number[]) => number

function euclidean(x: number[], y: number[]): number {
  let sum = 0
  for (let i = 0; i < x.length; i += 1) {
    const d = x[i]! - y[i]!
    sum += d * d
  }
  return Math.sqrt(sum)
}

/**
 * Classic unrestricted-path DTW alignment cost between two MFCC frame
 * sequences, O(|a|·|b|) — no Sakoe-Chiba band, since every clip in the
 * corpus is well under a second at a 10 ms hop (≤~100 frames).
 *
 * Normalized by `(n + m)` (an upper-bound approximation to the true warping
 * path length, which sits between `max(n, m)` and `n + m - 1`): reference
 * clip durations vary roughly 2x across the corpus (open vs. stop-coda
 * syllables), and unnormalized cumulative cost systematically favors
 * shorter references regardless of match quality. `Infinity` for either
 * empty sequence, so a failed extraction never silently wins a ranking.
 */
export function dtwDistance(a: number[][], b: number[][], distance: DistanceFn = euclidean): number {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return Infinity

  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity))
  cost[0]![0] = 0
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const d = distance(a[i - 1]!, b[j - 1]!)
      cost[i]![j] = d + Math.min(cost[i - 1]![j]!, cost[i]![j - 1]!, cost[i - 1]![j - 1]!)
    }
  }
  return cost[n]![m]! / (n + m)
}
