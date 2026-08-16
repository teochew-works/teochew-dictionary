import { describe, expect, it } from 'vitest'

import { entrySchema } from '../src/schema/entry.js'
import { emitAllSchemas } from '../src/schema/emit.js'

/**
 * Pure unit tests for entrySchema, independent of the shipped dataset — see
 * tests/dataset.test.ts for "every real entry validates".
 */

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ga6-咬',
    headword: '咬',
    readings: [{ pengim: 'ga6' }],
    senses: [{ pos: 'verb', gloss_en: ['to bite'] }],
    sources: ['wiktionary'],
    ...overrides,
  }
}

describe('entrySchema', () => {
  it('allows retrieved to be omitted', () => {
    const result = entrySchema.safeParse(baseEntry())
    expect(result.success).toBe(true)
  })

  it('accepts a valid retrieved date', () => {
    const result = entrySchema.safeParse(baseEntry({ retrieved: '2026-07-28' }))
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.retrieved).toBe('2026-07-28')
  })

  it('rejects a malformed retrieved date', () => {
    const result = entrySchema.safeParse(baseEntry({ retrieved: '28-07-2026' }))
    expect(result.success).toBe(false)
  })
})

describe('schema emission (issue #39)', () => {
  function emit(): Map<string, string> {
    const written = new Map<string, string>()
    emitAllSchemas((filename, contents) => written.set(filename, contents))
    return written
  }

  it('writes every schema in src/schema/, one file each', () => {
    expect([...emit().keys()].sort()).toEqual(
      [
        'audio-schema.json',
        'external-chart-schema.json',
        'pengim-schema.json',
        'poj-schema.json',
        'sandhi-schema.json',
        'schema.json',
        'syllable-inventory-schema.json',
        'variety-schema.json',
      ].sort(),
    )
  })

  it("bakes the known variety ids into schema.json's `variety` field", () => {
    const parsed = JSON.parse(emit().get('schema.json')!)
    const variety =
      parsed.definitions.TeochewEntryFile.properties.entries.items.properties.readings.items
        .properties.variety
    expect(variety.enum).toEqual(expect.arrayContaining(['chaozhou', 'shantou', 'chaoyang']))
    expect(variety.default).toBe('chaozhou')
  })

  it('emits a distinct, well-formed schema for a phonology file', () => {
    const parsed = JSON.parse(emit().get('variety-schema.json')!)
    const properties = parsed.definitions.Variety.properties
    expect(properties).toHaveProperty('variety')
    expect(properties).not.toHaveProperty('entries')
  })
})
