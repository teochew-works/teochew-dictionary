import { describe, expect, it } from 'vitest'

import { formatAccuracy, tallyAccuracy, type EvalCase } from '../src/audio/eval.js'

function candidates(...keys: string[]): { key: string; distance: number }[] {
  return keys.map((key, i) => ({ key, distance: i }))
}

describe('tallyAccuracy', () => {
  it('counts a case under every rank threshold it clears', () => {
    const cases: EvalCase[] = [
      { truthKey: 'a1', candidates: candidates('a1', 'b2', 'c3') }, // rank 0: top-1/3/5
      { truthKey: 'b2', candidates: candidates('a1', 'b2', 'c3') }, // rank 1: top-3/5 only
      { truthKey: 'c3', candidates: candidates('a1', 'b2', 'c3', 'd4', 'c3') }, // rank 2: top-3/5 (first occurrence wins)
      { truthKey: 'z9', candidates: candidates('a1', 'b2', 'c3', 'd4', 'e5') }, // not found: none
    ]
    expect(tallyAccuracy(cases)).toEqual({ total: 4, top1: 1, top3: 3, top5: 3 })
  })

  it('is empty for no cases', () => {
    expect(tallyAccuracy([])).toEqual({ total: 0, top1: 0, top3: 0, top5: 0 })
  })

  it('formats percentages, and an em dash rather than dividing by zero', () => {
    expect(formatAccuracy('baseline', { total: 0, top1: 0, top3: 0, top5: 0 })).toContain('—')
    expect(formatAccuracy('baseline', { total: 2, top1: 1, top3: 2, top5: 2 })).toBe(
      'baseline\n  top-1: 1/2 (50.0%)\n  top-3: 2/2 (100.0%)\n  top-5: 2/2 (100.0%)',
    )
  })
})
