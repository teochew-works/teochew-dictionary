import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cacheFileName, isCached, syncWiktionaryPages } from '../src/importers/wiktionary-cache.js'
import type { WikitextResult } from '../src/importers/wiktionary.js'

describe('cacheFileName', () => {
  it('leaves an ordinary headword as its own filename', () => {
    expect(cacheFileName('潮州')).toBe('潮州')
    expect(cacheFileName('sih8 buh8 sah8 nah4')).toBe('sih8 buh8 sah8 nah4')
  })

  it('encodes path separators so a subpage title cannot escape the cache directory', () => {
    expect(cacheFileName('AC/DC')).toBe('AC%2FDC')
    expect(cacheFileName('a\\b')).toBe('a%5Cb')
  })

  it('encodes the escape character itself, so the mapping stays reversible', () => {
    expect(cacheFileName('50%')).toBe('50%25')
    expect(cacheFileName('50%2F')).toBe('50%252F')
  })

  it('encodes the bare relative-path names', () => {
    expect(cacheFileName('.')).toBe('%2E')
    expect(cacheFileName('..')).toBe('%2E%2E')
  })
})

describe('syncWiktionaryPages', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wiktionary-page-cache-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const PAGES: Record<string, string> = {
    潮州: '==Chinese==\n{{zh-pron|mn-t=dio5 ziu1}}',
    食: '==Chinese==\n{{zh-pron|mn-t=ziah8}}',
  }

  const fetchPage = async (title: string): Promise<WikitextResult> => {
    const wikitext = PAGES[title]
    return wikitext === undefined ? { status: 'missing' } : { status: 'ok', wikitext }
  }

  // `dir` is reassigned per test, so the options have to be built per call
  // rather than once at describe scope.
  const run = (headwords: string[], overrides: Record<string, unknown> = {}) =>
    syncWiktionaryPages(headwords, { cacheDir: dir, delayMs: 0, fetchPage, ...overrides })

  it('writes the raw wikitext verbatim, without extracting anything', async () => {
    const result = await run(['潮州'])

    expect(result).toMatchObject({ fetched: 1, missing: 0, skipped: 0, failed: [] })
    expect(readFileSync(join(dir, '潮州.wikitext'), 'utf8')).toBe(PAGES['潮州'])
  })

  it('records a headword with no Wiktionary page as an empty .miss', async () => {
    const result = await run(['無此字'])

    expect(result).toMatchObject({ fetched: 0, missing: 1 })
    expect(readFileSync(join(dir, '無此字.miss'), 'utf8')).toBe('')
    expect(existsSync(join(dir, '無此字.wikitext'))).toBe(false)
  })

  it('writes nothing for a failed request, so a later run retries it', async () => {
    const result = await run(['潮州'], {
      fetchPage: async (): Promise<WikitextResult> => ({ status: 'error', message: 'HTTP 503' }),
    })

    expect(result).toMatchObject({ fetched: 0, missing: 0, failed: ['潮州'] })
    expect(existsSync(join(dir, '潮州.wikitext'))).toBe(false)
    // The point of the distinction: a network blip must not become a permanent
    // miss that resume then skips forever.
    expect(existsSync(join(dir, '潮州.miss'))).toBe(false)
    expect(isCached('潮州', dir)).toBe(false)
  })

  it('treats a thrown fetch as a failure rather than crashing the run', async () => {
    const result = await run(['潮州', '食'], {
      fetchPage: async (title: string): Promise<WikitextResult> => {
        if (title === '潮州') throw new Error('socket hang up')
        return { status: 'ok', wikitext: PAGES['食']! }
      },
    })

    expect(result.failed).toEqual(['潮州'])
    expect(result.fetched).toBe(1)
  })

  it('skips headwords already cached under resume, without fetching them', async () => {
    await run(['潮州', '無此字'])

    const spy = vi.fn(fetchPage)
    const result = await run(['潮州', '無此字', '食'], { resume: true, fetchPage: spy })

    expect(result).toMatchObject({ skipped: 2, fetched: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('食')
  })

  it('refetches everything by default, even what is already on disk', async () => {
    await run(['潮州'])
    const spy = vi.fn(fetchPage)

    const result = await run(['潮州'], { fetchPage: spy })

    expect(result).toMatchObject({ fetched: 1, skipped: 0 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('clears the stale counterpart when a re-sync changes the answer', async () => {
    // A page that used to be absent has since been created…
    await run(['新詞'])
    expect(existsSync(join(dir, '新詞.miss'))).toBe(true)

    await run(['新詞'], {
      fetchPage: async (): Promise<WikitextResult> => ({ status: 'ok', wikitext: '==Chinese==' }),
    })
    expect(existsSync(join(dir, '新詞.miss'))).toBe(false)
    expect(readFileSync(join(dir, '新詞.wikitext'), 'utf8')).toBe('==Chinese==')

    // …and the reverse: a page that has since been deleted.
    await run(['新詞'], { fetchPage: async (): Promise<WikitextResult> => ({ status: 'missing' }) })
    expect(existsSync(join(dir, '新詞.wikitext'))).toBe(false)
    expect(existsSync(join(dir, '新詞.miss'))).toBe(true)
  })

  it('does not mistake a leftover temp file for a cached page', async () => {
    writeFileSync(join(dir, '潮州.wikitext.tmp'), 'half a pa')
    expect(isCached('潮州', dir)).toBe(false)
  })

  it('fetches every headword exactly once when running concurrently', async () => {
    const seen: string[] = []
    const headwords = Array.from({ length: 20 }, (_, i) => `字${i}`)

    const result = await run(headwords, {
      concurrency: 4,
      fetchPage: async (title: string): Promise<WikitextResult> => {
        seen.push(title)
        return { status: 'ok', wikitext: title }
      },
    })

    expect(result.fetched).toBe(20)
    expect([...seen].sort()).toEqual([...headwords].sort())
    expect(readFileSync(join(dir, '字19.wikitext'), 'utf8')).toBe('字19')
  })

  it('holds concurrent workers to one shared request rate', async () => {
    vi.useFakeTimers()
    try {
      const starts: number[] = []
      const promise = syncWiktionaryPages(['a', 'b', 'c', 'd'], {
        cacheDir: dir,
        delayMs: 100,
        concurrency: 4,
        fetchPage: async (title: string): Promise<WikitextResult> => {
          starts.push(Date.now())
          return { status: 'ok', wikitext: title }
        },
      })
      await vi.runAllTimersAsync()
      await promise

      // Four workers, but the delay is a rate limit rather than a per-worker
      // sleep, so the requests are still 100ms apart.
      const gaps = starts.slice(1).map((t, i) => t - starts[i]!)
      expect(gaps).toEqual([100, 100, 100])
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports progress against the total', async () => {
    const seen: Array<[number, number]> = []
    await run(['潮州', '食'], { onProgress: (done: number, total: number) => seen.push([done, total]) })
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ])
  })
})
