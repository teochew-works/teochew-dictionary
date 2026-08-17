import { describe, expect, it } from 'vitest'

import { mergeImportResults } from '../src/importers/staging.js'
import type { ImportResult, Proposal } from '../src/importers/types.js'

function proposal(headword: string, pengim: string): Proposal {
  return {
    headword,
    readings: [{ pengim, variety: 'chaozhou' }],
    source: 'wiktionary',
    retrieved: '2026-08-16',
    flags: [],
  }
}

describe('mergeImportResults', () => {
  it('unions proposals from both batches', () => {
    const previous = { proposals: [proposal('我', 'ua2')], misses: [] }
    const incoming: ImportResult = {
      source: 'wiktionary',
      proposals: [proposal('你', 'le2')],
      misses: [],
      notes: [],
    }

    const merged = mergeImportResults(previous, incoming)
    expect(merged.proposals.map((p) => p.headword)).toEqual(['我', '你'])
  })

  it('lets an incoming proposal replace an earlier one for the same headword', () => {
    const previous = { proposals: [proposal('我', 'wrong1')], misses: [] }
    const incoming: ImportResult = {
      source: 'wiktionary',
      proposals: [proposal('我', 'ua2')],
      misses: [],
      notes: [],
    }

    const merged = mergeImportResults(previous, incoming)
    expect(merged.proposals).toHaveLength(1)
    expect(merged.proposals[0]?.readings?.[0]?.pengim).toBe('ua2')
  })

  it('unions and dedupes misses', () => {
    const previous = { proposals: [], misses: ['甲', '乙'] }
    const incoming: ImportResult = { source: 'wiktionary', proposals: [], misses: ['乙', '丙'], notes: [] }

    const merged = mergeImportResults(previous, incoming)
    expect(merged.misses.slice().sort()).toEqual(['丙', '乙', '甲'].sort())
  })

  it('drops a headword from misses once it resolves to a proposal', () => {
    const previous = { proposals: [], misses: ['我'] }
    const incoming: ImportResult = {
      source: 'wiktionary',
      proposals: [proposal('我', 'ua2')],
      misses: [],
      notes: [],
    }

    const merged = mergeImportResults(previous, incoming)
    expect(merged.misses).not.toContain('我')
    expect(merged.proposals.map((p) => p.headword)).toContain('我')
  })

  it('prepends a cumulative summary note', () => {
    const previous = { proposals: [proposal('我', 'ua2')], misses: [] }
    const incoming: ImportResult = {
      source: 'wiktionary',
      proposals: [proposal('你', 'le2')],
      misses: ['甲'],
      notes: ['requested 2 headwords, resolved 1'],
    }

    const merged = mergeImportResults(previous, incoming)
    expect(merged.notes[0]).toMatch(/cumulative: 3 headword\(s\) tracked, 2 resolved/u)
  })
})
