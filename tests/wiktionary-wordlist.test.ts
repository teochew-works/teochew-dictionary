import { describe, expect, it } from 'vitest'

import { classifyAgainstEntries } from '../src/data/wiktionary-wordlist.js'
import type { LoadedEntry } from '../src/data/load.js'
import type { Entry } from '../src/schema/entry.js'

function entry(id: string, headword: string, variants?: string[]): LoadedEntry {
  return {
    file: 'fixture.yaml',
    entry: {
      id,
      headword,
      variants,
      readings: [{ pengim: 'a1', variety: 'chaozhou' }],
      senses: [{ pos: 'noun', gloss_en: ['x'] }],
      sources: ['fixture'],
    } as Entry,
  }
}

describe('classifyAgainstEntries', () => {
  const entries = [entry('a1-我', '我'), entry('le2-你', '你', ['汝'])]

  it('classifies a headword match as existing, with entry_id', () => {
    const items = classifyAgainstEntries(['我'], entries)
    expect(items).toEqual([{ headword: '我', status: 'existing', entry_id: 'a1-我' }])
  })

  it('classifies a variant match as existing', () => {
    const items = classifyAgainstEntries(['汝'], entries)
    expect(items).toEqual([{ headword: '汝', status: 'existing', entry_id: 'le2-你' }])
  })

  it('classifies an unmatched title as to_fetch', () => {
    const items = classifyAgainstEntries(['新'], entries)
    expect(items).toEqual([{ headword: '新', status: 'to_fetch' }])
  })

  it('preserves prior staged/no_reading status instead of resetting to to_fetch', () => {
    const previous = {
      list: 'wiktionary-teochew-index',
      items: [{ headword: '新', status: 'staged' as const }],
    }
    const items = classifyAgainstEntries(['新'], entries, previous)
    expect(items).toEqual([{ headword: '新', status: 'staged' }])
  })

  it('reclassifies as existing even if it was previously staged', () => {
    const previous = {
      list: 'wiktionary-teochew-index',
      items: [{ headword: '我', status: 'staged' as const }],
    }
    const items = classifyAgainstEntries(['我'], entries, previous)
    expect(items).toEqual([{ headword: '我', status: 'existing', entry_id: 'a1-我' }])
  })

  it('does not carry a prior to_fetch status forward specially', () => {
    const previous = {
      list: 'wiktionary-teochew-index',
      items: [{ headword: '新', status: 'to_fetch' as const }],
    }
    const items = classifyAgainstEntries(['新'], entries, previous)
    expect(items).toEqual([{ headword: '新', status: 'to_fetch' }])
  })
})
