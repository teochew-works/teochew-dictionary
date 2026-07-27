import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'

import { build } from '../src/build/index.js'
import { createEnricher, stripDiacritics, stripTones } from '../src/build/enrich.js'
import { lookup, openDb } from '../src/lookup/index.js'
import { checkMappingSources, validate, TONES } from '../src/validate/index.js'
import { loadEntries } from '../src/data/load.js'
import type { Variety } from '../src/schema/phonology.js'

/**
 * Guards the dataset itself, not just the code. A malformed entry should fail
 * CI in the same way a failing unit test does.
 */

describe('the shipped dataset', () => {
  const report = validate()

  it('has no validation errors', () => {
    const errors = report.issues.filter((i) => i.level === 'error')
    expect(errors, JSON.stringify(errors, null, 2)).toHaveLength(0)
  })

  it('is not empty', () => {
    expect(report.entryCount).toBeGreaterThan(50)
  })

  it('gives every entry a resolvable source', () => {
    // Provenance is a hard requirement; the schema enforces presence, the
    // validator enforces that the id resolves.
    for (const { entry } of loadEntries()) {
      expect(entry.sources.length, entry.id).toBeGreaterThan(0)
    }
  })

  it('attests all eight tones', () => {
    // The seed originally had zero tone 7 (陽去) against twenty tone 6 (陽上):
    // the whole category had been written as its neighbour. Every entry parsed
    // and derived cleanly, so nothing else here would have caught it. See
    // data/phonology/REVIEW.md § 7 for the assignment rule.
    const unattested = TONES.filter((t) => (report.toneCounts[t] ?? 0) === 0)
    expect(unattested, `unattested tones: ${unattested.join(', ')}`).toEqual([])
  })
})

describe('phonology provenance', () => {
  // A mapping cites the descriptions its `confidence` rests on. An id that does
  // not resolve is an error, not a warning — it still reads as evidence.
  const KNOWN = new Set(['pengim-1960', 'wikipedia'])

  /** One variety carrying a single nucleus mapping with the given citations. */
  function cited(...sources: string[]): Variety {
    return {
      variety: { id: 'test', name: 'Test' },
      nuclei: { e: { ipa: 'ɯ', confidence: 'high', sources } },
    }
  }

  it('rejects a mapping citing a source that does not resolve', () => {
    const issues = checkMappingSources(
      'varieties/test.yaml',
      cited('pengim-1960', 'no-such-source'),
      KNOWN,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', path: 'nuclei.e.sources' })
    expect(issues[0]?.message).toContain('no-such-source')
  })

  it('accepts a mapping whose ids all resolve', () => {
    expect(checkMappingSources('varieties/test.yaml', cited('pengim-1960', 'wikipedia'), KNOWN))
      .toEqual([])
  })
})

describe('enrichment', () => {
  const { enrich } = createEnricher()
  const entries = new Map(loadEntries().map(({ entry }) => [entry.id, entry]))

  it('derives every romanisation from Peng\'im alone', () => {
    const e = enrich(entries.get('dio5-ziu1-潮州')!)
    const cz = e.readings.find((r) => r.variety === 'chaozhou')!
    expect(cz.ipa).toBe('tie⁵⁵ tsiu³³')
    expect(cz.poj).toBe('tiô-tsiu')
    expect(cz.sandhi).toBe('dio7 ziu1')
  })

  it('derives a different IPA per variety from identical Peng\'im', () => {
    const e = enrich(entries.get('dio5-ziu1-潮州')!)
    const cz = e.readings.find((r) => r.variety === 'chaozhou')!
    const st = e.readings.find((r) => r.variety === 'shantou')!
    expect(cz.pengim).toBe(st.pengim)
    expect(cz.ipa).not.toBe(st.ipa)
  })

  it('collects search keys in every spelling a user might type', () => {
    const e = enrich(entries.get('dio5-ziu1-潮州')!)
    expect(e.search_keys).toEqual(
      expect.arrayContaining(['潮州', 'dio5 ziu1', 'dio ziu', 'dioziu', 'tiô-tsiu', 'tio-tsiu']),
    )
  })

  it('propagates low-confidence caveats to the reading', () => {
    const e = enrich(entries.get('dio5-ziu1-潮州')!)
    const cz = e.readings.find((r) => r.variety === 'chaozhou')!
    expect(cz.ipa_confidence).toBe('medium')
    expect(cz.ipa_caveats.length).toBeGreaterThan(0)
  })
})

describe('normalisation helpers', () => {
  it('strips tone digits', () => {
    expect(stripTones('dio5 ziu1')).toBe('dio ziu')
  })

  it('strips POJ diacritics', () => {
    expect(stripDiacritics('tiô-tsiu')).toBe('tio-tsiu')
    expect(stripDiacritics('tsia̍h')).toBe('tsiah')
  })
})

describe('lookup against the built database', () => {
  let db: Database.Database

  beforeAll(() => {
    build()
    db = openDb()
  })
  afterAll(() => db?.close())

  it('finds an entry by its characters', () => {
    const hits = lookup('潮州', db)
    expect(hits[0]?.entry.headword).toBe('潮州')
    expect(hits[0]?.match).toBe('headword')
  })

  it('finds an entry by Peng\'im, with or without tones', () => {
    expect(lookup('dio5 ziu1', db)[0]?.entry.headword).toBe('潮州')
    expect(lookup('dio ziu', db)[0]?.entry.headword).toBe('潮州')
    expect(lookup('dioziu', db)[0]?.entry.headword).toBe('潮州')
  })

  it('finds an entry by POJ, with or without diacritics', () => {
    expect(lookup('tiô-tsiu', db)[0]?.entry.headword).toBe('潮州')
    expect(lookup('tio-tsiu', db)[0]?.entry.headword).toBe('潮州')
  })

  it('falls back to full text for an English gloss', () => {
    const hits = lookup('congee', db)
    expect(hits[0]?.entry.headword).toBe('糜')
    expect(hits[0]?.match).toBe('fulltext')
  })

  it('prefers an exact headword hit over a fuzzy one', () => {
    expect(lookup('食', db)[0]?.match).toBe('headword')
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(lookup('zzzznotaword', db)).toEqual([])
  })

  it('does not let punctuation break the FTS query', () => {
    // FTS5 would treat these as syntax if the term were not quoted.
    expect(() => lookup('"', db)).not.toThrow()
    expect(() => lookup('a OR b', db)).not.toThrow()
    expect(() => lookup('rice*', db)).not.toThrow()
  })
})
