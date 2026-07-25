import { describe, expect, it } from 'vitest'

import { parseCedict } from '../src/importers/cedict.js'
import { extractTeochewReadings, importWiktionary } from '../src/importers/wiktionary.js'

describe('parseCedict', () => {
  const sample = [
    '# comment line',
    '潮州 潮州 [Chao2 zhou1] /Chaozhou, prefecture-level city in Guangdong/',
    '食 食 [shi2] /to eat/food/CL:種|种[zhong3]/',
    'malformed line without brackets',
    '飯 饭 [fan4] /cooked rice/meal/',
  ].join('\n')

  it('parses well-formed lines and skips the rest', () => {
    const records = parseCedict(sample)
    expect(records).toHaveLength(3)
    expect(records[0]).toMatchObject({
      traditional: '潮州',
      simplified: '潮州',
      pinyin: 'Chao2 zhou1',
    })
  })

  it('splits multiple glosses', () => {
    const [, shi] = parseCedict(sample)
    expect(shi?.glosses).toEqual(['to eat', 'food', 'CL:種|种[zhong3]'])
  })

  it('keeps traditional and simplified forms distinct', () => {
    const fan = parseCedict(sample).at(-1)
    expect(fan).toMatchObject({ traditional: '飯', simplified: '饭' })
  })
})

describe('extractTeochewReadings', () => {
  it('pulls the mn-t parameter out of zh-pron', () => {
    const wikitext = '{{zh-pron\n|m=cháozhōu\n|c=ciu4 zau1\n|mn-t=dio5 ziu1\n|cat=n\n}}'
    expect(extractTeochewReadings(wikitext)).toEqual(['dio5 ziu1'])
  })

  it('splits several readings in one parameter', () => {
    const wikitext = '{{zh-pron|mn-t=dio5 ziu1/diê5 ziu1}}'
    expect(extractTeochewReadings(wikitext)).toEqual(['dio5 ziu1', 'diê5 ziu1'])
  })

  it('accepts the underscore spelling of the parameter', () => {
    expect(extractTeochewReadings('{{zh-pron|mn_t=ziah8}}')).toEqual(['ziah8'])
  })

  it('strips wikilinks and inline markup', () => {
    const wikitext = '{{zh-pron|mn-t=[[dio5 ziu1]]<ref>x</ref>}}'
    expect(extractTeochewReadings(wikitext)).toEqual(['dio5 ziu1'])
  })

  it('returns nothing when the language is absent', () => {
    expect(extractTeochewReadings('{{zh-pron|m=cháozhōu|c=ciu4 zau1}}')).toEqual([])
  })
})

describe('importWiktionary', () => {
  const pages: Record<string, string> = {
    潮州: '{{zh-pron|mn-t=dio5 ziu1}}',
    食: '{{zh-pron|mn-t=ziah8}}',
    // Peng'im that cannot be real: tone 8 with no stop coda.
    壞: '{{zh-pron|mn-t=huai8}}',
    無此字: '',
  }
  const fetchPage = async (title: string) => pages[title] ?? null
  const opts = { delayMs: 0, fetchPage }

  it('proposes only well-formed readings', async () => {
    const r = await importWiktionary(['潮州', '食'], '2026-07-25', opts)
    expect(r.proposals).toHaveLength(2)
    expect(r.proposals[0]?.readings?.[0]?.pengim).toBe('dio5 ziu1')
  })

  it('rejects malformed Peng\'im rather than importing it', async () => {
    const r = await importWiktionary(['壞'], '2026-07-25', opts)
    expect(r.proposals).toHaveLength(0)
    expect(r.misses).toEqual(['壞'])
    expect(r.notes.join(' ')).toMatch(/1 candidate reading\(s\) rejected/u)
  })

  it('records pages it could not resolve', async () => {
    const r = await importWiktionary(['無此字', '不存在'], '2026-07-25', opts)
    expect(r.misses).toEqual(['無此字', '不存在'])
  })

  it('stamps provenance on every proposal', async () => {
    const r = await importWiktionary(['潮州'], '2026-07-25', opts)
    expect(r.proposals[0]).toMatchObject({ source: 'wiktionary', retrieved: '2026-07-25' })
  })
})
