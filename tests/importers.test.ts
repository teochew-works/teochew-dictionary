import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseCedict } from '../src/importers/cedict.js'
import { parsePronunciationHtml } from '../src/importers/learnteochew.js'
import { extractTeochewReadings, fetchWikitextResult, importWiktionary } from '../src/importers/wiktionary.js'

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

describe('fetchWikitextResult', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stub(body: unknown, status = 200): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
  }

  it('returns the wikitext of a page that exists', async () => {
    stub({ parse: { title: '潮州', wikitext: '==Chinese==' } })
    expect(await fetchWikitextResult('潮州')).toEqual({ status: 'ok', wikitext: '==Chinese==' })
  })

  it("reports a title Wiktionary has no page for as missing, not as an error", async () => {
    // Confirmed live: the API answers HTTP 200 with an error body here, so the
    // status code alone cannot be used to tell these two cases apart.
    stub({ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } })
    expect(await fetchWikitextResult('無此字')).toEqual({ status: 'missing' })
  })

  it('reports a server failure as an error, so callers can retry it', async () => {
    stub({}, 503)
    expect(await fetchWikitextResult('潮州')).toMatchObject({ status: 'error' })
  })

  it('reports a transport failure as an error rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')))
    expect(await fetchWikitextResult('潮州')).toEqual({ status: 'error', message: 'socket hang up' })
  })
})

describe('parsePronunciationHtml', () => {
  // A trimmed-down mirror of learnteochew.com/pages/pronunciation.html's real
  // markup (<thead>/<tbody>, curly-quote "Peng’im" header, comma-separated
  // alternate spellings, a non-Peng'im table that must be ignored).
  const html = `
    <table> <thead> <tr> <th>IPA</th> <th>Peng’im</th> <th>Duffus</th> <th>Fielde</th> </tr> </thead>
      <tbody>
        <tr> <td>p</td> <td>b</td> <td>p</td> <td>p</td> </tr>
        <tr> <td>pʰ</td> <td>p</td> <td>ph</td> <td>ph</td> </tr>
      </tbody>
    </table>
    <table> <thead> <tr> <th>IPA</th> <th>Peng’im</th> <th>Duffus</th> <th>Fielde</th> </tr> </thead>
      <tbody>
        <tr> <td>a</td> <td>a</td> <td>a</td> <td>a</td> </tr>
      </tbody>
    </table>
    <table> <thead> <tr> <th>IPA</th> <th>Peng’im</th> <th>Duffus</th> <th>Fielde</th> </tr> </thead>
      <tbody>
        <tr> <td>a</td> <td>a</td> <td>a</td> <td>a</td> </tr>
        <tr> <td>aʔ</td> <td>ah</td> <td>ah</td> <td>ah</td> </tr>
        <tr> <td>ie/io</td> <td>iê, io</td> <td>ie</td> <td>ie</td> </tr>
      </tbody>
    </table>
    <table> <thead> <tr> <th>Name</th> <th>IPA</th> <th>Peng’im</th> <th>Duffus</th> <th>Fielde</th> </tr> </thead>
      <tbody>
        <tr> <td>陰平</td> <td>33</td> <td>1</td> <td>a</td> <td>a</td> </tr>
        <tr> <td>陰上</td> <td>53</td> <td>2</td> <td>á</td> <td>á</td> </tr>
      </tbody>
    </table>
    <table> <thead> <tr> <th>Original tone</th> <th>After tone sandhi</th> </tr> </thead>
      <tbody>
        <tr> <td>1</td> <td>1</td> </tr>
      </tbody>
    </table>
  `

  it('extracts the Peng\'im column of the Consonants, Finals and Tones tables', () => {
    const chart = parsePronunciationHtml(html)
    expect(chart.initials).toEqual(['b', 'p'])
    expect(chart.tones).toEqual(['1', '2'])
  })

  it('picks the largest Peng\'im-bearing table as Finals, ignoring the smaller Vowels table', () => {
    const chart = parsePronunciationHtml(html)
    expect(chart.finals).toContain('ah')
  })

  it('splits comma-separated alternate spellings into individual finals', () => {
    const chart = parsePronunciationHtml(html)
    expect(chart.finals).toContain('iê')
    expect(chart.finals).toContain('io')
  })

  it('ignores the Tone Sandhi table, which has no Peng\'im column', () => {
    const chart = parsePronunciationHtml(html)
    expect(chart.tones).not.toContain('After tone sandhi')
  })

  it('throws when the expected tables cannot be found', () => {
    expect(() => parsePronunciationHtml('<p>no tables here</p>')).toThrow()
  })
})
