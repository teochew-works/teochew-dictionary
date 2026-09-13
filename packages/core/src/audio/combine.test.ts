import { describe, expect, it } from 'vitest'
import { combineAxes, type AttestedTriple, type AxisCandidates } from './combine.js'

const ATTESTED: AttestedTriple[] = [
  { syllable: 'deng1', initial: 'd', rime: 'eng', tone: 1 },
  { syllable: 'deng3', initial: 'd', rime: 'eng', tone: 3 },
  { syllable: 'geng1', initial: 'g', rime: 'eng', tone: 1 },
  // Legal per-axis labels ('d' initial, 'a' rime, tone 1 all exist elsewhere)
  // but this exact combination is never attested — must never be returned.
]

describe('combineAxes', () => {
  it('picks the attested triple whose axes best match the query, never an unattested combination', () => {
    const axes: AxisCandidates = {
      initial: [{ key: 'd', distance: 0.1 }, { key: 'g', distance: 0.9 }],
      rime: [{ key: 'eng', distance: 0.1 }, { key: 'a', distance: 0.9 }],
      tone: [{ key: '1', distance: 0.1 }, { key: '3', distance: 0.9 }],
    }
    const ranked = combineAxes(ATTESTED, axes)
    expect(ranked[0]!.syllable).toBe('deng1')
    expect(ranked.every((c) => ATTESTED.some((t) => t.syllable === c.syllable))).toBe(true)
  })

  it('omits an attested triple whose axis label has no candidate distance at all', () => {
    const axes: AxisCandidates = {
      initial: [{ key: 'd', distance: 0.1 }], // no 'g' candidate
      rime: [{ key: 'eng', distance: 0.1 }],
      tone: [{ key: '1', distance: 0.1 }, { key: '3', distance: 0.5 }],
    }
    const ranked = combineAxes(ATTESTED, axes)
    expect(ranked.map((c) => c.syllable)).toEqual(['deng1', 'deng3'])
  })

  it('produces scores that sum to 1 across the returned candidates and rank with distance', () => {
    const axes: AxisCandidates = {
      initial: [{ key: 'd', distance: 0.1 }, { key: 'g', distance: 0.2 }],
      rime: [{ key: 'eng', distance: 0.1 }],
      tone: [{ key: '1', distance: 0.1 }, { key: '3', distance: 5 }],
    }
    const ranked = combineAxes(ATTESTED, axes)
    const totalScore = ranked.reduce((sum, c) => sum + c.score, 0)
    expect(totalScore).toBeCloseTo(1)
    expect(ranked[0]!.score).toBeGreaterThan(ranked[ranked.length - 1]!.score)
  })

  it('is empty when nothing attested has candidates on every axis', () => {
    const axes: AxisCandidates = { initial: [], rime: [], tone: [] }
    expect(combineAxes(ATTESTED, axes)).toEqual([])
  })
})
