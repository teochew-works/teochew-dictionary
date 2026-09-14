import { describe, expect, it } from 'vitest'
import { DEFAULT_CHECKED_ACTIVE_MS_THRESHOLD, estimateChecked, estimatedCheckednessAdjustment } from './checkedness.js'

describe('estimateChecked', () => {
  it('calls a short clip checked and a long clip unchecked at the default threshold', () => {
    expect(estimateChecked(300)).toBe(true)
    expect(estimateChecked(900)).toBe(false)
  })

  it('is inclusive at the threshold itself', () => {
    expect(estimateChecked(DEFAULT_CHECKED_ACTIVE_MS_THRESHOLD)).toBe(true)
    expect(estimateChecked(DEFAULT_CHECKED_ACTIVE_MS_THRESHOLD + 1)).toBe(false)
  })

  it('honours a custom threshold', () => {
    expect(estimateChecked(600, 700)).toBe(true)
    expect(estimateChecked(600, 500)).toBe(false)
  })
})

describe('estimatedCheckednessAdjustment', () => {
  const checkedTones = new Set([4, 8])

  it('adds the penalty only when a candidate disagrees with the estimate', () => {
    const adjust = estimatedCheckednessAdjustment(true, checkedTones, 0.1) // estimate: checked
    expect(adjust({ tone: 4 }, 1)).toBeCloseTo(1) // checked, agrees
    expect(adjust({ tone: 8 }, 1)).toBeCloseTo(1) // checked, agrees
    expect(adjust({ tone: 1 }, 1)).toBeCloseTo(1.1) // unchecked, disagrees
  })

  it('flips which side is penalised when the estimate flips', () => {
    const adjust = estimatedCheckednessAdjustment(false, checkedTones, 0.1) // estimate: unchecked
    expect(adjust({ tone: 1 }, 1)).toBeCloseTo(1)
    expect(adjust({ tone: 4 }, 1)).toBeCloseTo(1.1)
  })

  it('defaults to the swept penalty magnitude', () => {
    const adjust = estimatedCheckednessAdjustment(true, checkedTones)
    expect(adjust({ tone: 1 }, 1)).toBeCloseTo(1.05)
  })
})
