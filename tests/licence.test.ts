import { describe, expect, it } from 'vitest'

import { BASE_LICENCE, PROJECT_ATTRIBUTION, resolveLicence, withProjectAttribution } from '../src/data/licence.js'
import { sourceSchema } from '../src/schema/entry.js'
import type { Source, SourceKind } from '../src/schema/entry.js'

/**
 * Pure unit tests for licence resolution, independent of the shipped dataset —
 * see tests/dataset.test.ts for "every real entry resolves".
 */

function source(id: string, licence: string, kind: SourceKind = 'import'): Source {
  return { id, name: id, kind, licence }
}

const SEED = source('seed', 'CC-BY-4.0')
const UNIHAN = source('unihan', 'Unicode-DFS-2016')
const WIKTIONARY = source('wiktionary', 'CC-BY-SA-4.0')
const CEDICT = source('cedict', 'CC-BY-SA-4.0')
const PENGIM_1960 = source('pengim-1960', 'unknown')

const sources = new Map(
  [SEED, UNIHAN, WIKTIONARY, CEDICT, PENGIM_1960].map((s) => [s.id, s]),
)

describe('resolveLicence', () => {
  it('resolves base-licence-only sources with no attribution owed', () => {
    expect(resolveLicence(['seed'], sources)).toEqual({ ok: true, licence: BASE_LICENCE, attributions: [] })
  })

  it('keeps a permissive-but-distinct licence from changing which licence governs', () => {
    // unihan is Unicode-DFS-2016, not BASE_LICENCE — it must not silently
    // become "CC-BY-4.0" as if it were the project's own text, but citing it
    // also must not force the entry away from BASE_LICENCE the way a
    // share-alike source would.
    expect(resolveLicence(['seed', 'unihan'], sources)).toEqual({
      ok: true,
      licence: BASE_LICENCE,
      attributions: ['unihan (Unicode-DFS-2016)'],
    })
  })

  it('lets a single share-alike source cover the whole entry', () => {
    expect(resolveLicence(['wiktionary'], sources)).toEqual({
      ok: true,
      licence: 'CC-BY-SA-4.0',
      attributions: ['wiktionary (CC-BY-SA-4.0)'],
    })
    expect(resolveLicence(['seed', 'wiktionary'], sources)).toEqual({
      ok: true,
      licence: 'CC-BY-SA-4.0',
      attributions: ['wiktionary (CC-BY-SA-4.0)'],
    })
  })

  it('does not treat two sources under the same share-alike licence as a conflict', () => {
    // wiktionary and cedict are both CC-BY-SA-4.0 — citing both on one entry
    // is the realistic case, and must not be flagged as incompatible.
    expect(resolveLicence(['wiktionary', 'cedict'], sources)).toEqual({
      ok: true,
      licence: 'CC-BY-SA-4.0',
      attributions: ['cedict (CC-BY-SA-4.0)', 'wiktionary (CC-BY-SA-4.0)'],
    })
  })

  it('rejects a source with an unclassified licence', () => {
    const result = resolveLicence(['pengim-1960'], sources)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain("'pengim-1960'")
  })

  it('rejects sources citing genuinely different share-alike licences', () => {
    // No two licences in data/sources.yaml conflict today — this exercises the
    // defensive branch with a fixture licence outside the real classification
    // table, which itself makes the source unclassified rather than
    // conflicting, so the assertion is on *some* rejection, not on which path.
    const conflicting = new Map([...sources, ['other-sa', source('other-sa', 'CC-BY-SA-3.0')]])
    const result = resolveLicence(['wiktionary', 'other-sa'], conflicting)
    expect(result.ok).toBe(false)
  })
})

describe('withProjectAttribution', () => {
  it('credits the project when no attribution would otherwise be owed', () => {
    // The entry-level fallback for issue #69 — resolveLicence itself stays
    // pure ("nobody else's notice is owed"); this is the separate,
    // entry-only step that turns that into "credit the project instead".
    expect(withProjectAttribution([])).toEqual([PROJECT_ATTRIBUTION])
  })

  it('leaves a non-empty attributions list untouched', () => {
    expect(withProjectAttribution(['unihan (Unicode-DFS-2016)'])).toEqual(['unihan (Unicode-DFS-2016)'])
  })
})

describe('sourceSchema', () => {
  it('defaults kind to import when omitted', () => {
    const parsed = sourceSchema.parse({ id: 'x', name: 'X', licence: 'CC-BY-4.0' })
    expect(parsed.kind).toBe('import')
  })

  it('rejects an import-kind source with no licence', () => {
    const result = sourceSchema.safeParse({ id: 'x', name: 'X', kind: 'import' })
    expect(result.success).toBe(false)
  })

  it('accepts a reference-kind source with no licence', () => {
    const result = sourceSchema.safeParse({ id: 'pengim-1960', name: 'Pengim 1960', kind: 'reference' })
    expect(result.success).toBe(true)
  })

  it('accepts a reference-kind source that still carries a licence', () => {
    // wikipedia's shape: kind: reference despite a real share-alike licence.
    const result = sourceSchema.safeParse({
      id: 'wikipedia',
      name: 'Wikipedia',
      kind: 'reference',
      licence: 'CC-BY-SA-4.0',
    })
    expect(result.success).toBe(true)
  })
})
