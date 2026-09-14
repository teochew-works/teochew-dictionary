import { describe, expect, it } from 'vitest'
import { computeMedianOnsetByInitial, estimatedOnsetAdjustment } from './onset.js'

describe('computeMedianOnsetByInitial', () => {
  it('computes the median onset per initial, treating null as 0', () => {
    const table = computeMedianOnsetByInitial([
      { initial: 's', onsetMs: 100 },
      { initial: 's', onsetMs: 200 },
      { initial: 's', onsetMs: 300 },
      { initial: 'm', onsetMs: null },
      { initial: 'm', onsetMs: 5 },
    ])
    expect(table.get('s')).toBe(200)
    expect(table.get('m')).toBe(2.5) // median of [0, 5]
  })
})

describe('estimatedOnsetAdjustment', () => {
  const table = new Map([
    ['s', 150],
    ['m', 0],
  ])

  it('adds a distance penalty proportional to the gap from the expected onset', () => {
    const adjust = estimatedOnsetAdjustment(150, table, 0.01) // query looks like a typical 's'
    expect(adjust({ initial: 's' }, 1)).toBeCloseTo(1) // no gap
    expect(adjust({ initial: 'm' }, 1)).toBeCloseTo(1 + 0.01 * 150) // 150ms gap
  })

  it('treats an initial missing from the table as expecting 0ms onset', () => {
    const adjust = estimatedOnsetAdjustment(50, table, 0.01)
    expect(adjust({ initial: 'unknown' }, 1)).toBeCloseTo(1 + 0.01 * 50)
  })

  it('defaults to the swept scale', () => {
    const adjust = estimatedOnsetAdjustment(100, table)
    expect(adjust({ initial: 'm' }, 1)).toBeCloseTo(1 + 0.005 * 100)
  })
})
