import { describe, expect, it } from 'vitest'

import {
  buildHskIndex,
  hskBandToCefr,
  matchEntryLevel,
  parseHskWordlist,
} from '../src/importers/mandarin-cognate-level.js'

describe('parseHskWordlist', () => {
  it('extracts simplified and traditional hanzi forms, each paired with every band', () => {
    const json = JSON.stringify([
      {
        simplified: '爱好',
        level: ['new-1', 'old-3'],
        forms: [{ traditional: '愛好' }],
      },
    ])
    expect(parseHskWordlist(json)).toEqual(
      expect.arrayContaining([
        { hanzi: '爱好', band: 'new-1' },
        { hanzi: '爱好', band: 'old-3' },
        { hanzi: '愛好', band: 'new-1' },
        { hanzi: '愛好', band: 'old-3' },
      ]),
    )
  })

  it('skips a row missing simplified/forms rather than throwing', () => {
    const json = JSON.stringify([{ level: ['old-1'] }])
    expect(parseHskWordlist(json)).toEqual([])
  })

  it('rejects a non-array top level', () => {
    expect(() => parseHskWordlist('{}')).toThrow()
  })
})

describe('hskBandToCefr', () => {
  it.each([
    ['old-1', 'A1'],
    ['old-2', 'A1'],
    ['old-3', 'A2'],
    ['old-4', 'B1'],
    ['old-5', 'B2'],
    ['old-6', 'C1'],
  ] as const)('maps %s to %s', (band, cefr) => {
    expect(hskBandToCefr(band)).toBe(cefr)
  })

  it('leaves an HSK 3.0-only band (new-N) unmapped', () => {
    expect(hskBandToCefr('new-7')).toBeUndefined()
  })

  it('leaves an unrecognized band unmapped', () => {
    expect(hskBandToCefr('newest-3')).toBeUndefined()
  })
})

describe('matchEntryLevel', () => {
  it('matches the headword directly', () => {
    const index = buildHskIndex([{ hanzi: '阿姨', band: 'old-3' }])
    expect(matchEntryLevel(['阿姨'], index)).toEqual({ level: 'A2' })
  })

  it('matches a variant writing when the headword itself misses', () => {
    const index = buildHskIndex([{ hanzi: '兄弟', band: 'old-1' }])
    expect(matchEntryLevel(['兄哥', '兄弟'], index)).toEqual({ level: 'A1' })
  })

  it('returns undefined when nothing matches', () => {
    const index = buildHskIndex([{ hanzi: '阿姨', band: 'old-3' }])
    expect(matchEntryLevel(['潮州'], index)).toBeUndefined()
  })

  it('returns undefined when every match is an unmapped band (e.g. new-N only)', () => {
    const index = buildHskIndex([{ hanzi: '阿拉伯语', band: 'new-7' }])
    expect(matchEntryLevel(['阿拉伯语'], index)).toBeUndefined()
  })

  it('flags ambiguous when matched records resolve to more than one CEFR level', () => {
    const index = buildHskIndex([
      { hanzi: '爱好', band: 'old-3' }, // A2
      { hanzi: '爱好', band: 'old-1' }, // A1
    ])
    expect(matchEntryLevel(['爱好'], index)).toEqual({ ambiguous: true })
  })

  it('does not flag ambiguous when multiple bands map to the same CEFR level', () => {
    const index = buildHskIndex([
      { hanzi: '你', band: 'old-1' },
      { hanzi: '你', band: 'old-2' },
    ])
    expect(matchEntryLevel(['你'], index)).toEqual({ level: 'A1' })
  })
})
