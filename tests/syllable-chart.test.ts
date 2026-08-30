import { describe, expect, it } from 'vitest'

import { buildSounds, type Sound } from '../src/build/sounds.js'
import { buildSyllableChart } from '../src/build/syllable-chart.js'
import { loadEntries } from '../src/data/load.js'
import type { LocalRecordingProposal } from '../src/importers/local-recording-types.js'
import { generateSyllables, rimeOf } from '../src/phonology/inventory.js'
import { loadPengimScheme } from '../src/phonology/load.js'
import { declaredRimeOrder, rimeSortKey } from '../src/phonology/rime-order.js'
import { parseSyllable } from '../src/phonology/syllable.js'

const scheme = loadPengimScheme()

function sound(overrides: Partial<Sound> & Pick<Sound, 'pengim' | 'initial' | 'rime' | 'tone'>): Sound {
  return { ipa: '', occurrences: 1, examples: [], clips: [], ...overrides }
}

function proposal(
  overrides: Partial<LocalRecordingProposal> & Pick<LocalRecordingProposal, 'pengim'>,
): LocalRecordingProposal {
  return {
    syllableCount: 1,
    localPath: 'data/staging/recordings/x.wav',
    speaker: 'test',
    recordedDate: '2026-01-01',
    consentAcknowledged: true,
    variety: 'chaozhou',
    ...overrides,
  }
}

describe('rimeSortKey', () => {
  it('orders a nucleus by its position in the declared nuclei list', () => {
    // nuclei: [ou, oi, ai, ao, ê, a, e, i, o, u] — 'ai' comes before 'a'.
    const ai = rimeSortKey(parseSyllable('ai1', scheme), scheme)
    const a = rimeSortKey(parseSyllable('a1', scheme), scheme)
    expect(ai[1]).toBeLessThan(a[1]!)
  })

  it('orders open < nasal < stop coda for a fixed nucleus', () => {
    const open = rimeSortKey(parseSyllable('a1', scheme), scheme) // rime 'a'
    const nasal = rimeSortKey(parseSyllable('ang1', scheme), scheme) // rime 'ang'
    const stop = rimeSortKey(parseSyllable('ab4', scheme), scheme) // rime 'ab'
    expect(open[4]).toBeLessThan(nasal[4]!)
    expect(nasal[4]).toBeLessThan(stop[4]!)
  })

  it('puts syllabic-nasal rimes in a bucket after every vowel-final rime', () => {
    const vowel = rimeSortKey(parseSyllable('a1', scheme), scheme)
    const syllabic = rimeSortKey(parseSyllable('m6', scheme), scheme)
    expect(vowel[0]).toBeLessThan(syllabic[0]!)
  })

  it('throws on a coda with no declared kind', () => {
    const badScheme = { ...scheme, syllable: { ...scheme.syllable, coda_kinds: {} } }
    expect(() => rimeSortKey(parseSyllable('ab4', scheme), badScheme)).toThrow()
  })
})

describe('declaredRimeOrder', () => {
  const syllables = generateSyllables(scheme)

  it('never drops a rime that generateSyllables produces', () => {
    const distinctRimes = new Set(syllables.map((s) => rimeOf(s)))
    expect(declaredRimeOrder(syllables, scheme).length).toBe(distinctRimes.size)
  })

  it('groups by nucleus in the declared order', () => {
    const order = declaredRimeOrder(syllables, scheme)
    expect(order.indexOf('ai')).toBeLessThan(order.indexOf('a'))
  })
})

describe('buildSyllableChart', () => {
  // Rimes only become chart rows once attested somewhere (any initial, any
  // tone) — see `SyllableChart.rimes`'s doc comment — so every test needs at
  // least one Sound establishing each rime under test.
  const baseline: Sound[] = [
    sound({ pengim: 'a1', initial: null, rime: 'a', tone: 1 }),
    sound({ pengim: 'ab4', initial: null, rime: 'ab', tone: 4 }),
  ]

  it('gives an open/nasal-coda cell the full unchecked tone set and a stop-coda cell only the checked tones', () => {
    const chart = buildSyllableChart(baseline, scheme)
    const open = chart.cells.find((c) => c.initial === '' && c.rime === 'a')!
    expect(open.legalTones).toEqual([1, 2, 3, 5, 6, 7])
    const stop = chart.cells.find((c) => c.initial === '' && c.rime === 'ab')!
    expect(stop.legalTones).toEqual([4, 8])
  })

  it('reflects attested and recorded tones from the given sounds, leaving others empty', () => {
    const sounds: Sound[] = [
      ...baseline,
      sound({ pengim: 'a1', initial: null, rime: 'a', tone: 1, clips: [{ url: 'https://x/1' }] }),
      sound({ pengim: 'a3', initial: null, rime: 'a', tone: 3 }),
    ]
    const chart = buildSyllableChart(sounds, scheme)
    const cell = chart.cells.find((c) => c.initial === '' && c.rime === 'a')!
    expect(cell.attestedTones).toEqual([1, 3])
    expect(cell.recordedTones).toEqual([1])
  })

  it('computes coverage counts from the given sounds', () => {
    const sounds: Sound[] = [
      sound({ pengim: 'a1', initial: null, rime: 'a', tone: 1, clips: [{ url: 'https://x/1' }] }),
      sound({ pengim: 'a3', initial: null, rime: 'a', tone: 3 }),
      sound({ pengim: 'ab4', initial: null, rime: 'ab', tone: 4 }),
    ]
    const chart = buildSyllableChart(sounds, scheme)
    expect(chart.coverage).toEqual({
      cellsAttested: 2,
      cellsWithRecording: 1,
      syllablesAttested: 3,
      syllablesRecorded: 1,
      cellsWithStaging: 0,
      syllablesStaged: 0,
    })
  })

  it('reflects staged tones from unreviewed local-recording proposals', () => {
    const sounds: Sound[] = [
      ...baseline,
      sound({ pengim: 'a1', initial: null, rime: 'a', tone: 1, clips: [{ url: 'https://x/1' }] }),
      sound({ pengim: 'a3', initial: null, rime: 'a', tone: 3 }),
    ]
    const staged = { proposals: [proposal({ pengim: 'a3' })] }
    const chart = buildSyllableChart(sounds, scheme, staged)
    const cell = chart.cells.find((c) => c.initial === '' && c.rime === 'a')!
    expect(cell.stagedTones).toEqual([3])
    expect(chart.coverage.cellsWithStaging).toBe(1)
    expect(chart.coverage.syllablesStaged).toBe(1)
  })

  it('excludes staged proposals for a different variety', () => {
    const sounds: Sound[] = [...baseline, sound({ pengim: 'a3', initial: null, rime: 'a', tone: 3 })]
    const staged = { proposals: [proposal({ pengim: 'a3', variety: 'chaoshan' })] }
    const chart = buildSyllableChart(sounds, scheme, staged)
    const cell = chart.cells.find((c) => c.initial === '' && c.rime === 'a')!
    expect(cell.stagedTones).toEqual([])
    expect(chart.coverage.syllablesStaged).toBe(0)
  })

  it('drops a staged proposal whose tone is not attested (defensive intersect against attestedTones)', () => {
    // 'a5' is a legal tone for the open rime 'a' (see the legal/checked-tone
    // test above) but not attested by `baseline`, which only attests tone 1.
    const staged = { proposals: [proposal({ pengim: 'a5' })] }
    const chart = buildSyllableChart(baseline, scheme, staged)
    const cell = chart.cells.find((c) => c.initial === '' && c.rime === 'a')!
    expect(cell.stagedTones).toEqual([])
  })

  it('does not double-count a tone that is both recorded and staged in the coverage rollup', () => {
    const sounds: Sound[] = [
      ...baseline,
      sound({ pengim: 'a1', initial: null, rime: 'a', tone: 1, clips: [{ url: 'https://x/1' }] }),
    ]
    const staged = { proposals: [proposal({ pengim: 'a1' })] }
    const chart = buildSyllableChart(sounds, scheme, staged)
    const cell = chart.cells.find((c) => c.initial === '' && c.rime === 'a')!
    expect(cell.stagedTones).toEqual([1]) // raw, unnetted at the cell level
    expect(cell.recordedTones).toEqual([1])
    expect(chart.coverage.cellsWithStaging).toBe(0) // netted at the rollup level
    expect(chart.coverage.syllablesStaged).toBe(0)
  })

  it('falls back to reading the real (currently empty) staging file when no third argument is given', () => {
    const chart = buildSyllableChart(baseline, scheme)
    expect(chart.coverage.syllablesStaged).toBe(0)
    expect(chart.coverage.cellsWithStaging).toBe(0)
  })

  it('produces one cell for every legal (initial, attested-rime) pair, with none dropped as "not legal" (out of scope this issue)', () => {
    const chart = buildSyllableChart(baseline, scheme)
    expect(chart.cells.length).toBe(chart.initials.length * chart.rimes.length)
  })

  it('restricts rimes to those attested somewhere in the lexicon, not generateSyllables()\'s full over-generating closure', () => {
    const chart = buildSyllableChart(baseline, scheme)
    expect(chart.rimes).toEqual(['a', 'ab'])
  })

  it(
    'reproduces the real dataset\'s known density figures (issue #155): 97 attested rimes, 1,746 legal cells, 962 attested',
    () => {
      const loaded = loadEntries()
      const soundsData = buildSounds(loaded, scheme)
      const chart = buildSyllableChart(soundsData.sounds, scheme)
      expect(chart.rimes.length).toBe(97)
      expect(chart.cells.length).toBe(1746)
      expect(chart.coverage.cellsAttested).toBe(962)
    },
    30_000,
  )

  it('carries example/examplePengim metadata for real initials but not the zero initial', () => {
    const chart = buildSyllableChart(baseline, scheme)
    expect(chart.initials[0]).toEqual({ pengim: '' })
    const b = chart.initials.find((i) => i.pengim === 'b')!
    expect(b.example).toBe('波')
    expect(b.examplePengim).toBe('bo1')
  })
})
