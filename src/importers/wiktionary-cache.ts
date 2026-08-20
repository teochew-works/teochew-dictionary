import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CACHE_DIR, WIKTIONARY_PAGE_CACHE_DIR } from '../paths.js'
import { fetchWikitextResult, type WikitextResult } from './wiktionary.js'

/**
 * Local mirror of Wiktionary wikitext, one file per headword (issue #79).
 *
 * Hand-merging the #68 candidate set spends most of its cost on live page
 * fetches: a drafting agent fetches a page to write the gloss, and the audit
 * pass fetches the same page again to check it. Neither step is cheap to
 * retry, because an interrupted run has saved nothing.
 *
 * Downloading the pages up front with plain HTTP separates the flaky, cheap
 * step from the expensive reasoning one. Nothing here reads or interprets a
 * page — that stays a job for a human or an agent, which is the quality bar,
 * not overhead.
 *
 * State lives entirely in the filenames, deliberately: there is no manifest to
 * fall out of sync with the directory, and resuming is just "is the file
 * already there?".
 *
 *   <headword>.wikitext   the page, raw and unextracted
 *   <headword>.miss       empty marker: asked, and Wiktionary has no such page
 *
 * A failed *request* writes neither, so the next run tries it again. Baking a
 * network blip into a permanent `.miss` is the one outcome this must avoid —
 * see `WikitextResult` in ./wiktionary.ts.
 */

export const PAGE_EXT = '.wikitext'
export const MISS_EXT = '.miss'

/**
 * Characters that would let a page title escape (or collide inside) the cache
 * directory. `%` is in the set so the encoding stays reversible — a real `%`
 * in a title becomes `%25` rather than being confused with an escape.
 */
const UNSAFE = /[%/\\\u0000-\u001F\u007F]/gu

/**
 * The cache is meant to be greppable and `ls`-able, so a headword is its own
 * filename — CJK filenames are fine on every filesystem this project targets.
 * Encoding only kicks in for the handful of titles that would otherwise be
 * path-hostile: none of the ~17k headwords currently in the wordlist need it,
 * but Wiktionary titles can contain `/` (subpages) and ad-hoc arguments can
 * contain anything.
 *
 * Caveat, unfixable at this layer: on a case-insensitive filesystem (macOS
 * APFS by default) two headwords differing only in case share one file. The
 * CLI warns when a run contains such a pair.
 */
export function cacheFileName(headword: string): string {
  const encoded = headword.replace(UNSAFE, (c) => '%' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(2, '0'))
  // '.' and '..' survive the character filter but are not usable names.
  return encoded === '.' || encoded === '..' ? encoded.replace(/\./gu, '%2E') : encoded
}

export function pagePath(headword: string, cacheDir: string = WIKTIONARY_PAGE_CACHE_DIR): string {
  return join(cacheDir, cacheFileName(headword) + PAGE_EXT)
}

export function missPath(headword: string, cacheDir: string = WIKTIONARY_PAGE_CACHE_DIR): string {
  return join(cacheDir, cacheFileName(headword) + MISS_EXT)
}

/** True once a headword has a settled answer on disk — a page or a miss. */
export function isCached(headword: string, cacheDir: string = WIKTIONARY_PAGE_CACHE_DIR): boolean {
  return existsSync(pagePath(headword, cacheDir)) || existsSync(missPath(headword, cacheDir))
}

export type CacheSymlinkStatus =
  | { valid: true; target: string }
  | { valid: false; reason: 'missing' | 'not-a-symlink' | 'broken' | 'not-a-directory' }

/**
 * `CACHE_DIR` (`.cache` at the repo root) is meant to be a symlink out to
 * wherever the operator actually wants the page cache to live — it can grow
 * to tens of thousands of files and is worth keeping outside the worktree
 * (and shared across worktrees of this repo) rather than letting a plain
 * directory accumulate inside one. The CLI refuses to sync unless that
 * symlink is genuinely there and resolves, rather than silently creating a
 * real directory in its place — see `assertCacheSymlink` in
 * ../cli/wiktionary-page-cache.js.
 *
 * `syncWiktionaryPages` itself stays agnostic to any of this: it takes
 * whatever `cacheDir` it's given, which is what keeps it testable against a
 * plain tmp directory. This check is a CLI-level policy, not a property of
 * the sync logic.
 */
export function checkCacheSymlink(cacheDir: string = CACHE_DIR): CacheSymlinkStatus {
  let linkStat
  try {
    linkStat = lstatSync(cacheDir)
  } catch {
    return { valid: false, reason: 'missing' }
  }
  if (!linkStat.isSymbolicLink()) return { valid: false, reason: 'not-a-symlink' }

  let targetStat
  try {
    targetStat = statSync(cacheDir) // follows the symlink
  } catch {
    return { valid: false, reason: 'broken' }
  }
  if (!targetStat.isDirectory()) return { valid: false, reason: 'not-a-directory' }

  return { valid: true, target: readlinkSync(cacheDir) }
}

export interface PageCacheResult {
  /** Pages written this run. */
  fetched: number
  /** Headwords Wiktionary has no page for; a `.miss` marker was written. */
  missing: number
  /** Skipped under `resume` because a settled answer was already on disk. */
  skipped: number
  /** Requests that failed. Nothing was written, so a later run retries them. */
  failed: string[]
}

export interface PageCacheOptions {
  cacheDir?: string
  /**
   * Minimum interval between request *starts*, shared across all workers —
   * a rate limit, not a per-worker sleep. Wiktionary asks clients to be
   * gentle, same 200ms default as the importers.
   */
  delayMs?: number
  /**
   * Requests in flight at once. The default of 1 is exactly the existing
   * importers' sequential behaviour, and `delayMs` still caps the rate however
   * high this goes.
   *
   * Worth raising mainly because of how the API misbehaves in bulk: most
   * requests answer in well under a second, but roughly one in ten stalls until
   * it hits the 30s timeout in ./wiktionary.ts. Sequentially each of those
   * blocks the queue. Overlapping them helps, though measured gains are noisy —
   * a stalled connection sometimes seems to drag its neighbours down with it.
   */
  concurrency?: number
  /** Skip headwords that already have a page or a miss on disk. */
  resume?: boolean
  /** Injectable for tests, and for running against a local dump. */
  fetchPage?: (title: string) => Promise<WikitextResult>
  onProgress?: (done: number, total: number, result: PageCacheResult) => void
}

/** Write via a temp file, so an interrupted run can't leave a truncated page that a resume would trust. */
function writeAtomic(path: string, body: string): void {
  const tmp = path + '.tmp'
  writeFileSync(tmp, body)
  renameSync(tmp, path)
}

/**
 * Rate limiter shared by every worker: hands out request slots `delayMs`
 * apart, whoever asks. Reserving the slot before awaiting is what holds N
 * concurrent workers to one shared rate rather than N times it.
 */
function makePacer(delayMs: number): () => Promise<void> {
  let nextSlot = 0
  return async () => {
    if (delayMs <= 0) return
    const now = Date.now()
    const slot = Math.max(now, nextSlot)
    nextSlot = slot + delayMs
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now))
  }
}

export async function syncWiktionaryPages(
  headwords: string[],
  options: PageCacheOptions = {},
): Promise<PageCacheResult> {
  const {
    cacheDir = WIKTIONARY_PAGE_CACHE_DIR,
    delayMs = 200,
    concurrency = 1,
    resume = false,
    fetchPage = fetchWikitextResult,
    onProgress,
  } = options

  mkdirSync(cacheDir, { recursive: true })

  const result: PageCacheResult = { fetched: 0, missing: 0, skipped: 0, failed: [] }
  const pace = makePacer(delayMs)

  let cursor = 0
  let done = 0

  async function work(): Promise<void> {
    for (;;) {
      const index = cursor
      cursor += 1
      const headword = headwords[index]
      if (headword === undefined) return

      const page = pagePath(headword, cacheDir)
      const miss = missPath(headword, cacheDir)

      if (resume && (existsSync(page) || existsSync(miss))) {
        result.skipped += 1
      } else {
        await pace()
        const fetched = await fetchPage(headword).catch(
          (e: unknown): WikitextResult => ({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
        )

        // A default (non-resume) re-sync overwrites, so the previous run's
        // answer for this headword has to go — otherwise a stale `.miss` sits
        // next to a fresh page and readers see both.
        if (fetched.status === 'ok') {
          writeAtomic(page, fetched.wikitext)
          rmSync(miss, { force: true })
          result.fetched += 1
        } else if (fetched.status === 'missing') {
          writeAtomic(miss, '')
          rmSync(page, { force: true })
          result.missing += 1
        } else {
          result.failed.push(headword)
        }
      }

      done += 1
      onProgress?.(done, headwords.length, result)
    }
  }

  const workers = Math.max(1, Math.min(Math.trunc(concurrency) || 1, headwords.length))
  await Promise.all(Array.from({ length: workers }, () => work()))

  return result
}
