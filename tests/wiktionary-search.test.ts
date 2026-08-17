import { afterEach, describe, expect, it, vi } from 'vitest'

import { searchTeochewPages, type SearchPage } from '../src/importers/wiktionary-search.js'

describe('searchTeochewPages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws on a MediaWiki API error body instead of treating it as zero hits', async () => {
    // MediaWiki reports API-level failures (e.g. the invalid `intitle:` regex a
    // bisected range can produce — see the module doc comment) as HTTP 200 with
    // an `error` body, not a non-2xx status; confirmed live against the actual
    // API. Silently falling through to "zero hits" here would drop that
    // subrange with no error surfaced.
    const body = {
      error: { code: 'cirrussearch-regex-syntax-error', info: 'Regular expression syntax error' },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
    )

    await expect(searchTeochewPages({ delayMs: 0 })).rejects.toThrow(/cirrussearch-regex-syntax-error/u)
  })

  it('paginates a single range until continue is absent, deduping and sorting titles', async () => {
    const pages: Record<number, SearchPage> = {
      0: { titles: ['乙', '丙'], totalHits: 3, nextOffset: 2 },
      2: { titles: ['甲', '丙'], totalHits: 3, nextOffset: null }, // '丙' repeated across pages
    }
    const offsetsRequested: number[] = []
    const fetchSearchPage = async (_query: string, offset: number) => {
      offsetsRequested.push(offset)
      const page = pages[offset]
      if (!page) throw new Error(`unexpected offset ${offset}`)
      return page
    }

    const titles = await searchTeochewPages({ delayMs: 0, fetchSearchPage })

    expect(offsetsRequested).toEqual([0, 2])
    expect(titles).toEqual([...new Set(['乙', '丙', '甲'])].sort())
  })

  it('stops after a single page when there is no continue token', async () => {
    const fetchSearchPage = async () => ({ titles: ['我'], totalHits: 1, nextOffset: null })
    const titles = await searchTeochewPages({ delayMs: 0, fetchSearchPage })
    expect(titles).toEqual(['我'])
  })

  it('reports each page via onPage as it is fetched', async () => {
    const pages: SearchPage[] = [
      { titles: ['甲'], totalHits: 2, nextOffset: 1 },
      { titles: ['乙'], totalHits: 2, nextOffset: null },
    ]
    let i = 0
    const fetchSearchPage = async () => pages[i++]!
    const seen: Array<{ offset: number; count: number }> = []

    await searchTeochewPages({
      delayMs: 0,
      fetchSearchPage,
      onPage: (page, _query, offset) => seen.push({ offset, count: page.titles.length }),
    })

    expect(seen).toEqual([
      { offset: 0, count: 1 },
      { offset: 1, count: 1 },
    ])
  })

  it('returns an empty list when there are no results', async () => {
    const fetchSearchPage = async () => ({ titles: [], totalHits: 0, nextOffset: null })
    const titles = await searchTeochewPages({ delayMs: 0, fetchSearchPage })
    expect(titles).toEqual([])
  })

  /**
   * Mimics CirrusSearch's `intitle:/^[start-end]/` (and its negated form)
   * filtering over a fixed corpus, plus the unfiltered base query.
   */
  function fakeIndex(allTitles: string[]) {
    return async (query: string, offset: number): Promise<SearchPage> => {
      const m = /intitle:\/\^\[(.)-(.)\]\//u.exec(query)
      const negated = query.includes('-intitle:')
      const range = m ? { start: m[1]!.codePointAt(0)!, end: m[2]!.codePointAt(0)! } : null

      const matches = allTitles
        .filter((t) => {
          if (!range) return true
          const cp = t.codePointAt(0)!
          const inRange = cp >= range.start && cp <= range.end
          return negated ? !inRange : inRange
        })
        .sort()

      const page = matches.slice(offset, offset + 500)
      const nextOffset = offset + page.length < matches.length ? offset + page.length : null
      return { titles: page, totalHits: matches.length, nextOffset }
    }
  }

  it('bisects the BMP range when totalHits exceeds maxOffset, and still finds everything', async () => {
    const allTitles = ['你', '我', '他', '的', '人']
    const titles = await searchTeochewPages({
      delayMs: 0,
      fetchSearchPage: fakeIndex(allTitles),
      maxOffset: 2,
    })
    expect(titles).toEqual([...allTitles].sort())
  })

  it('throws rather than silently drop results when one codepoint alone exceeds the cap', async () => {
    // Both titles share the same first character, so bisection can never
    // separate them into ranges small enough to page through.
    const allTitles = ['你a', '你b']
    await expect(
      searchTeochewPages({ delayMs: 0, fetchSearchPage: fakeIndex(allTitles), maxOffset: 1 }),
    ).rejects.toThrow(/cannot paginate further/u)
  })

  it('covers astral (>U+FFFF) titles via the negated BMP catch-all query', async () => {
    // 𡳞 is U+21CDE, outside the BMP — real for this lexicon (dialectal
    // Southern Min characters), and the reason BMP-only bisection alone
    // isn't sufficient.
    const allTitles = ['你', '我', '𡳞']
    const titles = await searchTeochewPages({
      delayMs: 0,
      fetchSearchPage: fakeIndex(allTitles),
      maxOffset: 2, // forces the slow path; each sub-query still fits
    })
    expect(titles).toEqual([...allTitles].sort())
  })
})
