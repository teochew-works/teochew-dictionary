import { describe, expect, it } from 'vitest'
import { buildQueue, gradeCard, newCardState } from './scheduler'
import type { CardState } from './types'

const NOW = new Date('2026-08-16T00:00:00.000Z')

describe('newCardState', () => {
  it('starts at the SM-2 defaults', () => {
    expect(newCardState('a', NOW)).toEqual({
      entryId: 'a',
      efactor: 2.5,
      interval: 0,
      repetitions: 0,
      dueAt: NOW.toISOString(),
      lastReviewedAt: null,
    })
  })
})

describe('gradeCard', () => {
  const fresh = newCardState('a', NOW)

  it('Again: EF drops, repetitions resets, due tomorrow', () => {
    const graded = gradeCard(fresh, 'again', NOW)
    expect(graded.efactor).toBeCloseTo(2.18, 5)
    expect(graded.repetitions).toBe(0)
    expect(graded.interval).toBe(1)
    expect(graded.dueAt).toBe(new Date('2026-08-17T00:00:00.000Z').toISOString())
    expect(graded.lastReviewedAt).toBe(NOW.toISOString())
  })

  it('Good: EF unchanged at EF=2.5, first review due in 1 day', () => {
    const graded = gradeCard(fresh, 'good', NOW)
    expect(graded.efactor).toBeCloseTo(2.5, 5)
    expect(graded.repetitions).toBe(1)
    expect(graded.interval).toBe(1)
  })

  it('Easy: EF rises, first review gets the easy bonus applied to the base interval', () => {
    const graded = gradeCard(fresh, 'easy', NOW)
    expect(graded.efactor).toBeCloseTo(2.6, 5)
    expect(graded.repetitions).toBe(1)
    expect(graded.interval).toBe(Math.round(1 * 1.3)) // 1
  })

  it('second Good review uses the 6-day ladder step', () => {
    const afterFirst = gradeCard(fresh, 'good', NOW)
    const afterSecond = gradeCard(afterFirst, 'good', NOW)
    expect(afterSecond.repetitions).toBe(2)
    expect(afterSecond.interval).toBe(6)
  })

  it('third+ Good review multiplies interval by ease factor', () => {
    const r1 = gradeCard(fresh, 'good', NOW)
    const r2 = gradeCard(r1, 'good', NOW)
    const r3 = gradeCard(r2, 'good', NOW)
    expect(r3.repetitions).toBe(3)
    expect(r3.interval).toBe(Math.round(r2.interval * r2.efactor))
  })

  it('EF never drops below 1.3 under repeated Again grades', () => {
    let state: CardState = fresh
    for (let i = 0; i < 50; i += 1) {
      state = gradeCard(state, 'again', NOW)
    }
    expect(state.efactor).toBeGreaterThanOrEqual(1.3)
    expect(state.efactor).toBeCloseTo(1.3, 5)
  })

  it('Again always resets repetitions to 0 and interval to 1, regardless of prior state', () => {
    const matured = gradeCard(gradeCard(gradeCard(fresh, 'good', NOW), 'good', NOW), 'easy', NOW)
    const relapsed = gradeCard(matured, 'again', NOW)
    expect(relapsed.repetitions).toBe(0)
    expect(relapsed.interval).toBe(1)
  })
})

describe('buildQueue', () => {
  const entries = [
    { id: 'low', frequency: 1 },
    { id: 'high', frequency: 5 },
    { id: 'mid', frequency: 3 },
  ]

  it('orders new cards by frequency descending when there are no due cards', () => {
    const queue = buildQueue(entries, new Map(), NOW)
    expect(queue.map((q) => q.entryId)).toEqual(['high', 'mid', 'low'])
    expect(queue.every((q) => q.kind === 'new')).toBe(true)
  })

  it('respects newCardCap', () => {
    const queue = buildQueue(entries, new Map(), NOW, 2)
    expect(queue).toHaveLength(2)
    expect(queue.map((q) => q.entryId)).toEqual(['high', 'mid'])
  })

  it('puts due cards before new cards, sorted by dueAt ascending', () => {
    const cards = new Map<string, CardState>([
      ['high', { ...newCardState('high', NOW), dueAt: new Date('2026-08-14T00:00:00Z').toISOString() }],
      ['mid', { ...newCardState('mid', NOW), dueAt: new Date('2026-08-10T00:00:00Z').toISOString() }],
    ])
    const queue = buildQueue(entries, cards, NOW)
    expect(queue).toEqual([
      { entryId: 'mid', kind: 'due' },
      { entryId: 'high', kind: 'due' },
      { entryId: 'low', kind: 'new' },
    ])
  })

  it('excludes cards not yet due, and excludes already-seen entries from the new pool', () => {
    const cards = new Map<string, CardState>([
      ['high', { ...newCardState('high', NOW), dueAt: new Date('2099-01-01T00:00:00Z').toISOString() }],
    ])
    const queue = buildQueue(entries, cards, NOW)
    expect(queue.map((q) => q.entryId)).toEqual(['mid', 'low'])
  })

  it('excludes a due card whose entryId is absent from entries, e.g. filtered out by a prompt-mode restriction', () => {
    const cards = new Map<string, CardState>([
      ['gone', { ...newCardState('gone', NOW), dueAt: new Date('2020-01-01T00:00:00Z').toISOString() }],
      ['high', { ...newCardState('high', NOW), dueAt: new Date('2020-01-01T00:00:00Z').toISOString() }],
    ])
    const queue = buildQueue(entries, cards, NOW)
    expect(queue.map((q) => q.entryId)).not.toContain('gone')
    expect(queue.map((q) => q.entryId)).toEqual(['high', 'mid', 'low'])
  })

  it('breaks frequency ties via the injected shuffle, not alphabetical id order', () => {
    const tied = [
      { id: 'aaa', frequency: 5 },
      { id: 'bbb', frequency: 5 },
      { id: 'ccc', frequency: 5 },
    ]
    // random() => 0 makes every Fisher-Yates swap target index 0, a fixed, traceable permutation.
    const queue = buildQueue(tied, new Map(), NOW, 20, () => 0)
    expect(queue.map((q) => q.entryId)).toEqual(['bbb', 'ccc', 'aaa'])
  })

  it('still ranks by frequency first — shuffling never lets a lower-frequency entry jump ahead', () => {
    const queue = buildQueue(entries, new Map(), NOW, 20, () => 0)
    expect(queue.map((q) => q.entryId)).toEqual(['high', 'mid', 'low'])
  })
})
