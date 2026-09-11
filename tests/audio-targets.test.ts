import { describe, expect, it } from 'vitest'

import type { ClipFeatures } from '../src/audio/features.js'
import { MIN_MEASURABLE_ONSET_MS, type CorpusStats, type Spread } from '../src/audio/grade.js'
import { checkRender, composeTarget, levelTarget } from '../src/audio/targets.js'
import { parseSyllable } from '../src/phonology/syllable.js'
import { DU2_FEATURES, RENDER_INFO } from './helpers/audio-fixtures.js'

function spread(median: number, n = 10, sigma = 1): Spread {
  return { n, median, sigma }
}

const CONTOUR = Array.from({ length: 20 }, (_, i) => 190 - i * 4)

const STATS: CorpusStats = {
  byTone: {
    2: { f0Semitones: spread(5), contourHz: CONTOUR, voicedMs: spread(470), rmsDb: spread(-12) },
    4: { f0Semitones: spread(4), contourHz: CONTOUR, voicedMs: spread(230), rmsDb: spread(-12) },
  },
  byToneCoda: { '2:open': { voicedMs: spread(455) }, '2:nasal': { voicedMs: spread(475) } },
  byInitial: { s: { onsetMs: spread(115, 10, 50) }, t: { onsetMs: spread(5) } },
  rmsDb: spread(-12.5, 3000, 3),
  // Median crest 10 dB + 2σ = 11.5 dB of headroom: fits under −1 dBFS with the −12.5 median exactly.
  crestDb: spread(10, 3000, 0.75),
}

describe('composeTarget', () => {
  it('composes the tone contour, tone × coda duration, initial onset and corpus level', () => {
    expect(composeTarget(STATS, parseSyllable('sim2'))).toEqual({
      contourHz: CONTOUR,
      voicedMs: 475,
      onsetMs: 115,
      rmsDb: -12.5,
    })
  })

  it('lowers the level target when the corpus is too peaky to reach the median under the ceiling', () => {
    const peaky = { ...STATS, crestDb: spread(14, 3000, 1) }
    expect(levelTarget(peaky)).toBe(-1 - 16)
    expect(levelTarget(peaky, -3)).toBe(-3 - 16)
    expect(composeTarget(peaky, parseSyllable('a2'), { peakCeilingDb: -3 })).toMatchObject({ rmsDb: -19, peakCeilingDb: -3 })
    // Never *raises* it above the median.
    expect(levelTarget({ ...STATS, crestDb: spread(2, 3000, 0.1) })).toBe(-12.5)
  })

  it('keeps the clip onset for a zero initial, a voiced initial, and an unmeasurable one', () => {
    expect(composeTarget(STATS, parseSyllable('a2'))!.onsetMs).toBeNull()
    expect(composeTarget(STATS, parseSyllable('ma2'))!.onsetMs).toBeNull()
    expect(STATS.byInitial['t']!.onsetMs.median).toBeLessThan(MIN_MEASURABLE_ONSET_MS)
    expect(composeTarget(STATS, parseSyllable('ta2'))!.onsetMs).toBeNull()
  })

  it("falls back to the tone's duration when the coda class has no clips", () => {
    // Tone 4 has no byToneCoda entry at all in this fixture.
    expect(composeTarget(STATS, parseSyllable('giag4'))!.voicedMs).toBe(230)
  })

  it('returns null for a tone the corpus has no yardstick for', () => {
    expect(composeTarget(STATS, parseSyllable('a5'))).toBeNull()
    const noContour = { ...STATS, byTone: { ...STATS.byTone, 2: { ...STATS.byTone[2]!, contourHz: [] } } }
    expect(composeTarget(noContour, parseSyllable('a2'))).toBeNull()
  })

  it('passes rendering options through only when given', () => {
    expect(composeTarget(STATS, parseSyllable('a2'), { f0Blend: 0.8, padMs: 80 })).toMatchObject({ f0Blend: 0.8, padMs: 80 })
    expect(composeTarget(STATS, parseSyllable('a2'))).not.toHaveProperty('f0Blend')
  })
})

describe('checkRender', () => {
  const target = composeTarget(STATS, parseSyllable('sim2'))!
  const rendered = (overrides: Partial<ClipFeatures> = {}): ClipFeatures => ({
    ...DU2_FEATURES,
    voicedMs: 475,
    onsetMs: 115,
    rmsDb: -12.5,
    f0: { medianHz: 152, startHz: 190, endHz: 114, contour: CONTOUR },
    ...overrides,
  })
  const info = { ...RENDER_INFO, renderedVoicedMs: 475, renderedOnsetMs: 115 }

  it('passes a render that landed on its targets', () => {
    const check = checkRender(STATS, parseSyllable('sim2'), target, info, rendered())
    expect(check.pass).toBe(true)
    expect(check.maxZ).toBeLessThan(0.5)
    expect(Object.keys(check.z).sort()).toEqual(['f0', 'onsetMs', 'rmsDb', 'voicedMs'])
  })

  it('scores against what was rendered, not the group median — a kept source onset is not a miss', () => {
    const kept = { ...info, renderedOnsetMs: 0 }
    const check = checkRender(STATS, parseSyllable('sim2'), target, kept, rendered({ onsetMs: 0 }))
    expect(check.z.onsetMs).toBeUndefined()
    expect(check.pass).toBe(true)
  })

  it('does not score an onset against an initial the corpus cannot measure', () => {
    const check = checkRender(STATS, parseSyllable('tim2'), composeTarget(STATS, parseSyllable('tim2'))!, { ...info, renderedOnsetMs: 40 }, rendered({ onsetMs: 10 }))
    expect(check.z.onsetMs).toBeUndefined()
    expect(check.pass).toBe(true)
  })

  it('scores level against the target, which may sit below the corpus median', () => {
    const peaky = { ...STATS, crestDb: spread(14, 3000, 1) }
    const lowTarget = composeTarget(peaky, parseSyllable('sim2'))!
    expect(lowTarget.rmsDb).toBe(-17)
    expect(checkRender(peaky, parseSyllable('sim2'), lowTarget, info, rendered({ rmsDb: -17.2 })).pass).toBe(true)
    expect(checkRender(peaky, parseSyllable('sim2'), lowTarget, info, rendered({ rmsDb: -11 })).flags).toEqual([
      expect.stringMatching(/^rmsDb \+2\.\dσ off target$/),
    ])
  })

  it('flags the misses by name, and an octave error as such', () => {
    const check = checkRender(STATS, parseSyllable('sim2'), target, info, rendered({ voicedMs: 300, rmsDb: -20 }))
    expect(check.pass).toBe(false)
    expect(check.flags).toEqual([expect.stringMatching(/^voicedMs -\d+\.\dσ off target$/), expect.stringMatching(/^rmsDb -2\.\dσ off target$/)])
    const octave = checkRender(STATS, parseSyllable('sim2'), target, info, rendered({ f0: { medianHz: 76, startHz: 95, endHz: 57, contour: CONTOUR.map((v) => v / 2) } }))
    expect(octave.flags[0]).toBe('f0 an octave below the template')
    expect(checkRender(STATS, parseSyllable('sim2'), target, info, rendered({ f0: { medianHz: null, startHz: null, endHz: null, contour: null } })).flags).toContain('no voiced frames')
  })

  it('honours the tolerance', () => {
    const slightlyOff = rendered({ rmsDb: -12.5 - 3 * 1.2 })
    expect(checkRender(STATS, parseSyllable('sim2'), target, info, slightlyOff, 1).pass).toBe(false)
    expect(checkRender(STATS, parseSyllable('sim2'), target, info, slightlyOff, 1.5).pass).toBe(true)
  })
})
