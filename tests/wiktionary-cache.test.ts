import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cacheFileName,
  checkCacheSymlink,
  findMainWorktreeCacheTarget,
  isCached,
  syncWiktionaryPages,
} from '../src/importers/wiktionary-cache.js'
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

describe('checkCacheSymlink', () => {
  let scratch: string

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'cache-symlink-'))
  })

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  it('reports missing when nothing exists at the path', () => {
    const status = checkCacheSymlink(join(scratch, 'nope'))
    expect(status).toEqual({ valid: false, reason: 'missing' })
  })

  it('reports not-a-symlink for a plain directory', () => {
    const dir = join(scratch, 'plain')
    mkdirSync(dir)
    expect(checkCacheSymlink(dir)).toEqual({ valid: false, reason: 'not-a-symlink' })
  })

  it('reports not-a-symlink for a plain file', () => {
    const file = join(scratch, 'plain-file')
    writeFileSync(file, '')
    expect(checkCacheSymlink(file)).toEqual({ valid: false, reason: 'not-a-symlink' })
  })

  it('reports broken for a symlink whose target does not exist', () => {
    const link = join(scratch, 'broken-link')
    symlinkSync(join(scratch, 'does-not-exist'), link)
    expect(checkCacheSymlink(link)).toEqual({ valid: false, reason: 'broken' })
  })

  it('reports not-a-directory for a symlink that resolves to a file', () => {
    const file = join(scratch, 'a-file')
    writeFileSync(file, '')
    const link = join(scratch, 'link-to-file')
    symlinkSync(file, link)
    expect(checkCacheSymlink(link)).toEqual({ valid: false, reason: 'not-a-directory' })
  })

  it('is valid for a symlink that resolves to a real directory', () => {
    const target = join(scratch, 'target')
    mkdirSync(target)
    const link = join(scratch, 'link')
    symlinkSync(target, link)
    expect(checkCacheSymlink(link)).toEqual({ valid: true, target })
  })
})

describe('findMainWorktreeCacheTarget', () => {
  let mainRepoRoot: string

  beforeEach(() => {
    mainRepoRoot = mkdtempSync(join(tmpdir(), 'main-repo-'))
  })

  afterEach(() => {
    rmSync(mainRepoRoot, { recursive: true, force: true })
  })

  // A linked worktree's `--git-dir` is an absolute path under the main
  // checkout's `.git/worktrees/<name>`; the main checkout's own `--git-dir`
  // and `--git-common-dir` are identical, which is exactly the signal this
  // function uses to tell "I am the main checkout" from "I am a worktree".
  function fakeWorktreeGit(worktreeName = 'my-branch') {
    const responses: Record<string, string> = {
      'rev-parse --git-dir': join(mainRepoRoot, '.git', 'worktrees', worktreeName),
      'rev-parse --git-common-dir': join(mainRepoRoot, '.git'),
    }
    return (args: string[]): string | null => responses[args.join(' ')] ?? null
  }

  it('returns null when git-dir and git-common-dir agree — this checkout is not a linked worktree', () => {
    const runGit = (args: string[]): string | null => ({ 'rev-parse --git-dir': '.git', 'rev-parse --git-common-dir': '.git' })[args.join(' ')] ?? null
    expect(findMainWorktreeCacheTarget({ repoRoot: '/some/worktree', runGit })).toBeNull()
  })

  it('returns null when git commands fail — no repo, or git unavailable', () => {
    expect(findMainWorktreeCacheTarget({ repoRoot: '/some/worktree', runGit: () => null })).toBeNull()
  })

  it("returns null when the main checkout's .cache does not exist", () => {
    expect(findMainWorktreeCacheTarget({ repoRoot: '/some/worktree', runGit: fakeWorktreeGit() })).toBeNull()
  })

  it("returns null when the main checkout's .cache is not a symlink", () => {
    mkdirSync(join(mainRepoRoot, '.cache'))
    expect(findMainWorktreeCacheTarget({ repoRoot: '/some/worktree', runGit: fakeWorktreeGit() })).toBeNull()
  })

  it("mirrors the main checkout's .cache symlink target when it is valid", () => {
    const target = mkdtempSync(join(tmpdir(), 'wiktionary-page-cache-'))
    symlinkSync(target, join(mainRepoRoot, '.cache'))

    expect(findMainWorktreeCacheTarget({ repoRoot: '/some/worktree', runGit: fakeWorktreeGit() })).toBe(target)
    rmSync(target, { recursive: true, force: true })
  })

  it('resolves a relative symlink target against the main checkout root, not the worktree', () => {
    const targetDir = join(mainRepoRoot, 'actual-cache')
    mkdirSync(targetDir)
    symlinkSync('actual-cache', join(mainRepoRoot, '.cache'))

    expect(findMainWorktreeCacheTarget({ repoRoot: '/some/worktree', runGit: fakeWorktreeGit() })).toBe(targetDir)
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

  describe('adaptive concurrency', () => {
    it('ramps concurrency up from 1 as requests succeed cleanly, capped at the ceiling', async () => {
      const headwords = Array.from({ length: 30 }, (_, i) => `字${i}`)
      let inFlight = 0
      let maxInFlight = 0

      const result = await run(headwords, {
        concurrency: 3,
        fetchPage: async (title: string): Promise<WikitextResult> => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((r) => setTimeout(r, 5))
          inFlight -= 1
          return { status: 'ok', wikitext: title }
        },
      })

      expect(result.fetched).toBe(30)
      // Proves it actually ramped (not stuck at the starting point of 1)...
      expect(maxInFlight).toBeGreaterThan(1)
      // ...without ever exceeding the ceiling passed as `concurrency`.
      expect(maxInFlight).toBeLessThanOrEqual(3)
    })

    it('keeps concurrency low when 429s keep interrupting the clean-success streak', async () => {
      const headwords = Array.from({ length: 40 }, (_, i) => `字${i}`)
      let inFlight = 0
      let maxInFlight = 0
      let calls = 0

      const result = await run(headwords, {
        concurrency: 8,
        fetchPage: async (title: string): Promise<WikitextResult> => {
          calls += 1
          const thisCall = calls
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((r) => setTimeout(r, 2))
          inFlight -= 1
          // A 429 often enough that a clean streak never reaches the 5-success
          // ramp threshold, so the ceiling of 8 should never be approached —
          // proving the halve-on-429 behaviour, not just the ramp-up half.
          if (thisCall % 4 === 0) return { status: 'error', message: 'HTTP 429' }
          return { status: 'ok', wikitext: title }
        },
      })

      expect(result.fetched + result.failed.length).toBe(40)
      expect(maxInFlight).toBeLessThan(4)
    })

    it('does not punish concurrency for an ordinary (non-429) failure', async () => {
      const headwords = Array.from({ length: 20 }, (_, i) => `字${i}`)
      let inFlight = 0
      let maxInFlight = 0

      const result = await run(headwords, {
        concurrency: 3,
        fetchPage: async (title: string): Promise<WikitextResult> => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          await new Promise((r) => setTimeout(r, 5))
          inFlight -= 1
          if (title === '字0') return { status: 'error', message: 'socket hang up' }
          return { status: 'ok', wikitext: title }
        },
      })

      expect(result.failed).toEqual(['字0'])
      // A single stall shouldn't stop the run from still reaching the ceiling.
      expect(maxInFlight).toBe(3)
    })

    it('reports the current adaptive limit via onProgress, never exceeding the ceiling', async () => {
      const headwords = Array.from({ length: 12 }, (_, i) => `字${i}`)
      const concurrencySeen: number[] = []

      await run(headwords, {
        concurrency: 4,
        onProgress: (_done: number, _total: number, _result: unknown, concurrency: number) =>
          concurrencySeen.push(concurrency),
        fetchPage: async (title: string): Promise<WikitextResult> => ({ status: 'ok', wikitext: title }),
      })

      expect(concurrencySeen).toHaveLength(12)
      expect(concurrencySeen.every((c) => c >= 1 && c <= 4)).toBe(true)
    })
  })
})
