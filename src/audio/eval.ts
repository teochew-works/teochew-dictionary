/**
 * Held-out accuracy tallying, shared by every `audio:classify-*-eval` CLI
 * (issue #280). Deliberately decoupled from how a ranking is produced — the
 * whole-syllable classifier (#279) and the initial/rime/tone axis classifier
 * both reduce to "for each held-out query, a truth key and a distance-sorted
 * candidate list," so one tally function serves both without duplicating the
 * top-1/3/5 counting logic.
 *
 * #279's own 54.1%/64.6%/69.3% numbers were produced by an ad hoc, uncommitted
 * script — this module (plus `audio-classify-eval.ts`) is that script made
 * real and reusable.
 */

export interface RankedCandidate {
  key: string
  distance: number
}

export interface EvalCase {
  /** The manifest key (Peng'im syllable) the query clip actually is. */
  truthKey: string
  /** Reference candidates, already sorted by ascending distance. */
  candidates: RankedCandidate[]
}

export interface AccuracyTally {
  total: number
  top1: number
  top3: number
  top5: number
}

function rankOf(truthKey: string, candidates: RankedCandidate[]): number | null {
  const index = candidates.findIndex((c) => c.key === truthKey)
  return index === -1 ? null : index
}

export function tallyAccuracy(cases: EvalCase[]): AccuracyTally {
  const tally: AccuracyTally = { total: cases.length, top1: 0, top3: 0, top5: 0 }
  for (const { truthKey, candidates } of cases) {
    const rank = rankOf(truthKey, candidates)
    if (rank === null) continue
    if (rank < 1) tally.top1 += 1
    if (rank < 3) tally.top3 += 1
    if (rank < 5) tally.top5 += 1
  }
  return tally
}

function pct(count: number, total: number): string {
  return total === 0 ? '—' : `${((100 * count) / total).toFixed(1)}%`
}

export function formatAccuracy(label: string, tally: AccuracyTally): string {
  const { total, top1, top3, top5 } = tally
  return (
    `${label}\n` +
    `  top-1: ${top1}/${total} (${pct(top1, total)})\n` +
    `  top-3: ${top3}/${total} (${pct(top3, total)})\n` +
    `  top-5: ${top5}/${total} (${pct(top5, total)})`
  )
}
