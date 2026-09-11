import { describe, expect, it } from 'vitest'

import type { ClipFeatures } from '../src/audio/features.js'
import { codaClass, computeCorpusStats, gradeCorpus, hzToSemitones, median, spread, toneCodaKey } from '../src/audio/grade.js'
import { parseSyllable } from '../src/phonology/syllable.js'

function features(overrides: Partial<ClipFeatures> & { f0Hz?: number | null } = {}): ClipFeatures {
  const { f0Hz = 130, ...rest } = overrides
  return {
    totalMs: 1000,
    sampleRate: 48000,
    trim: { startMs: 200, endMs: 800 },
    activeMs: 600,
    rmsDb: -13,
    peakDb: -6,
    onsetMs: 60,
    voicedMs: 500,
    voicedRatio: 0.9,
    f0:
      f0Hz === null
        ? { medianHz: null, startHz: null, endHz: null, contour: null }
        : { medianHz: f0Hz, startHz: f0Hz, endHz: f0Hz, contour: Array(20).fill(f0Hz) },
    ...rest,
  }
}

/**
 * A tone group of `n` well-behaved clips around `f0Hz`/`voicedMs`, jittered
 * symmetrically (so the median is exactly the base) by enough that σ > 0.
 */
function group(tone: number, n: number, f0Hz: number, voicedMs: number, initial = 's', rime = 'a'): { key: string; id: string; features: ClipFeatures }[] {
  const jitter = [0, 1, -1, 2, -2]
  return Array.from({ length: n }, (_, i) => {
    const j = jitter[i % jitter.length]!
    return {
      key: `${initial}${rime}${tone}`,
      id: `${initial}${rime}${tone}-${i}`,
      features: features({ f0Hz: f0Hz + j, voicedMs: voicedMs + 4 * j, rmsDb: -13 + j, onsetMs: 60 + j }),
    }
  })
}

/** A clip that sits exactly on `group`'s baseline except for `overrides`. */
function like(tone: number, f0Hz: number | null, voicedMs: number | null, id: string, overrides: Parameters<typeof features>[0] = {}) {
  return { key: `sa${tone}`, id, features: features({ f0Hz, voicedMs, ...overrides }) }
}

describe('robust statistics', () => {
  it('median handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNaN()
  })

  it('spread is median ± 1.4826·MAD, unmoved by one wild value', () => {
    const s = spread([10, 11, 12, 13, 14, 1000])
    expect(s.median).toBe(12.5)
    expect(s.sigma).toBeCloseTo(1.4826 * 1.5, 5)
    expect(spread([5]).sigma).toBe(0)
    expect(spread([]).n).toBe(0)
  })

  it('semitone scale puts 100 Hz at 0 and an octave at 12', () => {
    expect(hzToSemitones(100)).toBe(0)
    expect(hzToSemitones(200)).toBe(12)
  })
})

describe('coda class', () => {
  it('splits open, nasal and stop codas', () => {
    expect(codaClass(parseSyllable('a1'))).toBe('open')
    expect(codaClass(parseSyllable('tin5'))).toBe('open') // nasalised vowel, no coda
    expect(codaClass(parseSyllable('ang1'))).toBe('nasal')
    expect(codaClass(parseSyllable('sim1'))).toBe('nasal')
    expect(codaClass(parseSyllable('giag4'))).toBe('stop')
    expect(codaClass(parseSyllable('bhuêh8'))).toBe('stop')
    expect(toneCodaKey(4, 'stop')).toBe('4:stop')
  })
})

describe('computeCorpusStats', () => {
  it('files f0 and duration under tone, duration under tone × coda, onset under initial', () => {
    const inputs = [...group(1, 5, 140, 650), ...group(4, 5, 130, 300, 'g', 'iag')].map((g) => ({
      syllable: parseSyllable(g.key),
      features: g.features,
    }))
    const stats = computeCorpusStats(inputs)

    expect(Object.keys(stats.byTone).map(Number)).toEqual([1, 4])
    expect(100 * 2 ** (stats.byTone[1]!.f0Semitones.median / 12)).toBeCloseTo(140, 0)
    expect(stats.byTone[1]!.contourHz).toHaveLength(20)
    expect(stats.byTone[4]!.voicedMs.median).toBe(300)
    expect(stats.byToneCoda['1:open']!.voicedMs.n).toBe(5)
    expect(stats.byToneCoda['4:stop']!.voicedMs.n).toBe(5)
    expect(stats.byInitial['s']!.onsetMs.n).toBe(5)
    expect(stats.byInitial['g']!.onsetMs.n).toBe(5)
    expect(stats.rmsDb.n).toBe(10)
  })

  it('leaves a voiced initial and a zero initial out of the onset groups, keeps a voiceless stop', () => {
    const stats = computeCorpusStats([
      { syllable: parseSyllable('ma1'), features: features({ onsetMs: 5 }) },
      { syllable: parseSyllable('bhi1'), features: features({ onsetMs: 5 }) },
      { syllable: parseSyllable('a1'), features: features({ onsetMs: 30 }) },
      { syllable: parseSyllable('ba1'), features: features({ onsetMs: 10 }) },
    ])
    expect(Object.keys(stats.byInitial)).toEqual(['b'])
  })
})

describe('gradeCorpus', () => {
  it('flags the clip an octave off its tone and the one at the wrong level', () => {
    const inputs = [...group(5, 10, 184, 650), like(5, 92, 650, 'octave'), like(5, 184, 650, 'quiet', { rmsDb: -30 })]
    const grade = gradeCorpus(inputs)
    const byId = Object.fromEntries(grade.clips.map((c) => [c.id, c]))

    expect(byId['octave']!.flags).toEqual(["f0 an octave below tone 5's median"])
    expect(byId['quiet']!.flags).toEqual([expect.stringMatching(/^level -\d+\.\dσ$/)])
    expect(byId['sa5-0']!.flags).toEqual([])
    expect(byId['octave']!.maxZ).toBeGreaterThan(byId['sa5-0']!.maxZ)
  })

  it('measures duration against the tone × coda group, so a short checked syllable is not an outlier', () => {
    const inputs = [...group(4, 10, 130, 300, 'g', 'iag'), ...group(1, 10, 140, 650)]
    const grade = gradeCorpus(inputs)
    expect(grade.clips.every((c) => c.flags.length === 0)).toBe(true)
    expect(grade.clips.find((c) => c.key === 'giag4')!.z.voicedMs).toBeDefined()
  })

  it('flags unvoiced, barely-voiced and unparseable clips without a z-score', () => {
    const grade = gradeCorpus([
      ...group(1, 5, 140, 650),
      like(1, null, null, 'silent', { onsetMs: null, voicedRatio: 0 }),
      like(1, 140, 650, 'breathy', { voicedRatio: 0.2 }),
      { key: 'xyz9', id: 'bad-key', features: features() },
    ])
    const byId = Object.fromEntries(grade.clips.map((c) => [c.id, c]))
    expect(byId['silent']!.flags).toEqual(['no voiced frames'])
    expect(byId['silent']!.z.f0).toBeUndefined()
    expect(byId['breathy']!.flags).toEqual(['barely voiced (0.2)'])
    expect(byId['bad-key']).toMatchObject({ syllable: null, flags: ['unparseable key'], maxZ: 0 })
  })

  it('gives no z-score against a group too small or too uniform to have a σ', () => {
    const grade = gradeCorpus([
      { key: 'sa1', id: 'a', features: features() },
      { key: 'sa1', id: 'b', features: features() },
    ])
    expect(grade.clips.map((c) => c.z)).toEqual([{}, {}])
  })

  it('reports a non-octave f0 outlier in σ, and an octave above as such', () => {
    const inputs = [...group(5, 10, 184, 650), like(5, 240, 650, 'sharp'), like(5, 368, 650, 'up')]
    const byId = Object.fromEntries(gradeCorpus(inputs).clips.map((c) => [c.id, c]))
    expect(byId['sharp']!.flags).toEqual([expect.stringMatching(/^f0 \+\d+\.\dσ for tone 5$/)])
    expect(byId['up']!.flags).toEqual(["f0 an octave above tone 5's median"])
  })

  it('does not score onsets against an initial whose typical onset is unmeasurable', () => {
    // Ten /t/ clips whose aspiration fell below the silence bound (onset ~0–2 ms), one where it didn't.
    const quiet = Array.from({ length: 10 }, (_, i) => ({
      key: 'ta1',
      id: `ta1-${i}`,
      features: features({ f0Hz: 140 + (i % 3) - 1, voicedMs: 650 + (i % 3) * 4 - 4, onsetMs: i % 3 }),
    }))
    const loud = { key: 'ta1', id: 'aspirated', features: features({ f0Hz: 140, voicedMs: 650, onsetMs: 60 }) }
    const grade = gradeCorpus([...quiet, loud])
    expect(grade.stats.byInitial['t']!.onsetMs.n).toBe(11)
    expect(grade.clips.find((c) => c.id === 'aspirated')!.flags).toEqual([])
    expect(grade.clips.find((c) => c.id === 'aspirated')!.z.onsetMs).toBeUndefined()
  })

  it('honours a custom outlier threshold', () => {
    const inputs = [...group(1, 10, 140, 650), like(1, 143, 650, 'mild')]
    expect(gradeCorpus(inputs, { outlierZ: 2.5 }).clips.find((c) => c.id === 'mild')!.flags).toEqual([])
    expect(gradeCorpus(inputs, { outlierZ: 1 }).clips.find((c) => c.id === 'mild')!.flags.length).toBeGreaterThan(0)
  })
})
