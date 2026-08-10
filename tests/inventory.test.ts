import { describe, expect, it } from 'vitest'

import { loadSyllableInventory } from '../src/data/load.js'
import {
  buildAttestationIndex,
  buildSyllableInventory,
  generateSyllables,
  rimeOf,
} from '../src/phonology/inventory.js'
import { formatSyllable, parseSyllable } from '../src/phonology/syllable.js'
import type { LoadedEntry } from '../src/data/load.js'
import type { Entry } from '../src/schema/entry.js'

const VALID = [
  'dio5', 'ziu1', 'ziah8', 'nang5', 'bng7', 'ng5', 'm6', 'san1', 'toin2',
  'ngou6', 'gao2', 'lag8', 'ua2', 'le2', 'i1', 'ing1', 'in5', 'bho5', 'cu3',
  'zab8', 'zêg8', 'lang5',
]

const INVALID = ['za8', 'go4', 'ziah5', 'lag5', 'bad4', 'xyz1', 'd1']

describe('generateSyllables', () => {
  const syllables = generateSyllables()
  const raws = new Set(syllables.map((s) => s.raw))

  it.each(VALID)('includes the known-valid syllable %s', (s) => {
    expect(raws.has(s)).toBe(true)
  })

  it.each(INVALID)('excludes the known-invalid combination %s', (s) => {
    expect(raws.has(s)).toBe(false)
  })

  it('has no duplicate raw forms', () => {
    expect(raws.size).toBe(syllables.length)
  })

  it('round-trips every generated syllable through formatSyllable', () => {
    for (const s of syllables) expect(formatSyllable(s)).toBe(s.raw)
  })

  it('reparses every generated raw form to an identical syllable', () => {
    for (const s of syllables) expect(parseSyllable(s.raw)).toEqual(s)
  })
})

describe('rimeOf', () => {
  it.each([
    ['dio5', 'io'],
    ['ing1', 'ing'],
    ['bng7', 'ng'],
    ['san1', 'an'],
  ])('rimeOf(%s) === %s', (input, expected) => {
    expect(rimeOf(parseSyllable(input))).toBe(expected)
  })
})

describe('buildAttestationIndex', () => {
  function entry(id: string, readings: { pengim: string; variety?: string }[]): LoadedEntry {
    return {
      file: 'fixture.yaml',
      entry: {
        id,
        headword: id,
        readings: readings.map((r) => ({ pengim: r.pengim, variety: r.variety ?? 'chaozhou' })),
        senses: [{ pos: 'noun', gloss_en: ['x'] }],
        sources: ['fixture'],
      } as Entry,
    }
  }

  it('buckets attestation by syllable and variety', () => {
    const index = buildAttestationIndex([
      entry('a', [{ pengim: 'dio5 ziu1', variety: 'chaozhou' }]),
      entry('b', [{ pengim: 'dio5', variety: 'shantou' }]),
    ])

    expect([...index.get('dio5')!.get('chaozhou')!]).toEqual(['a'])
    expect([...index.get('dio5')!.get('shantou')!]).toEqual(['b'])
    expect([...index.get('ziu1')!.get('chaozhou')!]).toEqual(['a'])
    expect(index.has('za8')).toBe(false)
  })

  it('skips malformed readings rather than throwing', () => {
    const index = buildAttestationIndex([entry('bad', [{ pengim: 'za8' }])])
    expect(index.size).toBe(0)
  })
})

describe('the committed syllable inventory', () => {
  // Guards the generated file, not just the generator: catches pengim.yaml or
  // an entry's readings changing without `npm run inventory` being rerun,
  // the same way tests/dataset.test.ts guards the shipped lexicon.
  it('is exactly what the generator produces right now', () => {
    expect(loadSyllableInventory()).toEqual(buildSyllableInventory())
  })
})
