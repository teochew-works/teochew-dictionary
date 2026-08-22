import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadWiktextractIndex, sensesFor } from '../src/importers/wiktextract.js'

describe('loadWiktextractIndex', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wiktextract-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writeJsonl(records: unknown[]): string {
    const path = join(dir, 'teochew-relevant.min.jsonl')
    writeFileSync(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
    return path
  }

  it('indexes records by headword', () => {
    const path = writeJsonl([
      { word: '潮州', pos: 'proper noun', senses: [{ glosses: ['a city'] }] },
      { word: '食', pos: 'verb', senses: [{ glosses: ['to eat'] }] },
    ])
    const index = loadWiktextractIndex(path)
    expect(index.get('潮州')).toHaveLength(1)
    expect(index.get('食')?.[0]?.pos).toBe('verb')
  })

  it('collects every record for a headword with multiple POS/etymology sections', () => {
    const path = writeJsonl([
      { word: '本土', pos: 'noun', senses: [{ glosses: ['native land'] }] },
      { word: '本土', pos: 'adj', senses: [{ glosses: ['local'] }] },
    ])
    const index = loadWiktextractIndex(path)
    expect(index.get('本土')).toHaveLength(2)
  })

  it('skips blank lines', () => {
    const path = join(dir, 'with-blanks.jsonl')
    writeFileSync(path, '{"word":"我"}\n\n{"word":"你"}\n')
    const index = loadWiktextractIndex(path)
    expect([...index.keys()].sort()).toEqual(['你', '我'])
  })

  it('returns an empty index when the file is absent, rather than throwing', () => {
    const index = loadWiktextractIndex(join(dir, 'does-not-exist.jsonl'))
    expect(index.size).toBe(0)
  })
})

describe('sensesFor', () => {
  it('flattens senses across every record for a headword', () => {
    const index = new Map([
      [
        '本土',
        [
          { word: '本土', pos: 'noun', senses: [{ glosses: ['native land'] }] },
          { word: '本土', pos: 'adj', senses: [{ glosses: ['local'] }] },
        ],
      ],
    ])
    expect(sensesFor('本土', index)).toEqual([{ glosses: ['native land'] }, { glosses: ['local'] }])
  })

  it('returns an empty array for a headword absent from the index', () => {
    expect(sensesFor('不存在', new Map())).toEqual([])
  })
})
