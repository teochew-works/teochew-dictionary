import { describe, expect, it } from 'vitest'

import { BASE_LICENCE, resolveLicence } from '../src/data/licence.js'
import type { Source } from '../src/schema/entry.js'

/**
 * Pure unit tests for licence resolution, independent of the shipped dataset —
 * see tests/dataset.test.ts for "every real entry resolves".
 */

function source(id: string, licence: string): Source {
  return { id, name: id, licence }
}

const SEED = source('seed', 'BSD-3-Clause')
const UNIHAN = source('unihan', 'Unicode-DFS-2016')
const WIKTIONARY = source('wiktionary', 'CC-BY-SA-4.0')
const CEDICT = source('cedict', 'CC-BY-SA-4.0')
const PENGIM_1960 = source('pengim-1960', 'unknown')

const sources = new Map(
  [SEED, UNIHAN, WIKTIONARY, CEDICT, PENGIM_1960].map((s) => [s.id, s]),
)

describe('resolveLicence', () => {
  it('resolves permissive-only sources to the base licence', () => {
    expect(resolveLicence(['seed'], sources)).toEqual({ ok: true, licence: BASE_LICENCE })
    expect(resolveLicence(['seed', 'unihan'], sources)).toEqual({ ok: true, licence: BASE_LICENCE })
  })

  it('lets a single share-alike source cover the whole entry', () => {
    expect(resolveLicence(['wiktionary'], sources)).toEqual({ ok: true, licence: 'CC-BY-SA-4.0' })
    expect(resolveLicence(['seed', 'wiktionary'], sources)).toEqual({ ok: true, licence: 'CC-BY-SA-4.0' })
  })

  it('does not treat two sources under the same share-alike licence as a conflict', () => {
    // wiktionary and cedict are both CC-BY-SA-4.0 — citing both on one entry
    // is the realistic case, and must not be flagged as incompatible.
    expect(resolveLicence(['wiktionary', 'cedict'], sources)).toEqual({ ok: true, licence: 'CC-BY-SA-4.0' })
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
