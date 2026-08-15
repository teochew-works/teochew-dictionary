import { describe, expect, it } from 'vitest'

import { entrySchema } from '../src/schema/entry.js'

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
