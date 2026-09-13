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

  it('lets a heavily-weighted axis override the other two', () => {
    const attested: AttestedTriple[] = [
      { syllable: 'a', initial: 'ia', rime: 'ra', tone: 5 },
      { syllable: 'b', initial: 'ib', rime: 'rb', tone: 6 },
    ]
    // initial/rime weakly favor 'a' (small normalised gap, extra spread-out
    // labels included so min-max doesn't fully saturate to {0,1}); tone more
    // strongly favors 'b'.
    const axes: AxisCandidates = {
      initial: [{ key: 'ia', distance: 0.1 }, { key: 'ib', distance: 0.2 }, { key: 'filler', distance: 1.0 }],
      rime: [{ key: 'ra', distance: 0.1 }, { key: 'rb', distance: 0.2 }, { key: 'filler', distance: 1.0 }],
      tone: [{ key: '5', distance: 0.5 }, { key: '6', distance: 0.4 }, { key: '1', distance: 0 }, { key: '2', distance: 1 }],
    }
    const equal = combineAxes(attested, axes)
    expect(equal[0]!.syllable).toBe('a') // initial+rime's combined small edge still wins unweighted

    const toneWeighted = combineAxes(attested, axes, { weights: { initial: 1, rime: 1, tone: 10 } })
    expect(toneWeighted[0]!.syllable).toBe('b') // a 10x tone weight flips it
  })

  it('scopes the softmax to scoreWindow candidates, zeroing everything past it', () => {
    const attested: AttestedTriple[] = Array.from({ length: 5 }, (_, i) => ({
      syllable: `s${i}`,
      initial: 'd',
      rime: 'eng',
      tone: i + 1,
    }))
    const axes: AxisCandidates = {
      initial: [{ key: 'd', distance: 0 }],
      rime: [{ key: 'eng', distance: 0 }],
      tone: Array.from({ length: 5 }, (_, i) => ({ key: String(i + 1), distance: i })),
    }
    const ranked = combineAxes(attested, axes, { scoreWindow: 2 })
    expect(ranked.slice(0, 2).every((c) => c.score > 0)).toBe(true)
    expect(ranked.slice(2).every((c) => c.score === 0)).toBe(true)
    expect(ranked.reduce((sum, c) => sum + c.score, 0)).toBeCloseTo(1)
  })
})
