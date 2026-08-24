import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { CACHE_DIR, ROOT, WIKTIONARY_PAGE_CACHE_DIR } from '../paths.js'
import { logRetryToStderr } from './types.js'
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

function defaultRunGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

export interface FindMainWorktreeCacheOptions {
  /** Where to run git from — defaults to this repo's own root. */
  repoRoot?: string
  /** Injectable for tests, so this needs no real git repo to exercise. */
  runGit?: (args: string[], cwd: string) => string | null
}

/**
 * A linked worktree (`git worktree add`) starts with no `.cache` of its own,
 * even though the main checkout usually already has one set up. Rather than
 * make every new worktree an operator has to symlink by hand, find whatever
 * target the main checkout's `.cache` already points at, so the CLI can
 * mirror it.
 *
 * Deliberately narrow: this only ever answers "what does the *main* checkout
 * point at", and only when that is itself a valid symlink. It is up to the
 * caller to use this solely for the `missing` case — a `.cache` that exists
 * here but is broken or the wrong kind of thing is a problem to surface, not
 * something to paper over by relinking it.
 */
export function findMainWorktreeCacheTarget(options: FindMainWorktreeCacheOptions = {}): string | null {
  const { repoRoot = ROOT, runGit = defaultRunGit } = options

  const gitDir = runGit(['rev-parse', '--git-dir'], repoRoot)
  const commonDir = runGit(['rev-parse', '--git-common-dir'], repoRoot)
  if (gitDir === null || commonDir === null) return null

  const absoluteGitDir = resolve(repoRoot, gitDir)
  const absoluteCommonDir = resolve(repoRoot, commonDir)
  // Equal for the main checkout itself (and for a plain, non-worktree clone) —
  // only a linked worktree's git-dir lives apart from the shared common-dir.
  if (absoluteGitDir === absoluteCommonDir) return null

  const mainRepoRoot = dirname(absoluteCommonDir)
  const status = checkCacheSymlink(join(mainRepoRoot, '.cache'))
  if (!status.valid) return null

  return isAbsolute(status.target) ? status.target : resolve(mainRepoRoot, status.target)
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
   * Ceiling on requests in flight at once — not a fixed worker count.
   * Concurrency actually used starts at 1 and ramps toward this ceiling as
   * requests succeed cleanly (see `AdaptiveConcurrency`), so the default of 1
   * is exactly the existing importers' sequential behaviour and stays that
   * way unless a caller opts into a higher ceiling. `delayMs` still caps the
   * request-start rate however high this goes.
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
  /** `concurrency` is the adaptive governor's *current* limit, not the ceiling. */
  onProgress?: (done: number, total: number, result: PageCacheResult, concurrency: number) => void
}

/**
 * AIMD governor for how many requests may be in flight at once. Starts at the
 * most conservative value (1) and adds one more slot after `rampAfter`
 * consecutive clean completions (a settled `ok`/`missing` answer). A 429 —
 * the one unambiguous "back off" signal Wiktimedia sends — halves the limit
 * immediately and resets the streak, so a run finds its own safe ceiling
 * instead of a fixed `--concurrency` either sitting needlessly idle or
 * hammering straight through a rate limit.
 *
 * Deliberately does *not* react to a plain timeout/error: roughly one request
 * in ten stalls under completely normal conditions (see `PageCacheOptions`),
 * so treating every failure as a rate-limit signal would suppress concurrency
 * even when nothing is actually wrong.
 */
export class AdaptiveConcurrency {
  private limit = 1
  private active = 0
  private cleanStreak = 0
  private readonly waiters: Array<() => void> = []

  constructor(
    private readonly ceiling: number,
    private readonly rampAfter = 5,
  ) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.active += 1
  }

  /** Releases this caller's own slot — always call once per successful `acquire`. */
  release(): void {
    this.active -= 1
    this.waiters.shift()?.()
  }

  reportSuccess(): void {
    this.cleanStreak += 1
    if (this.cleanStreak < this.rampAfter || this.limit >= this.ceiling) return
    this.cleanStreak = 0
    this.limit += 1
    // The extra slot is usable immediately, not just after the next release().
    this.waiters.shift()?.()
  }

  /** A non-rate-limit failure: interrupts the ramp streak without punishing the limit. */
  resetStreak(): void {
    this.cleanStreak = 0
  }

  reportThrottle(): void {
    this.cleanStreak = 0
    this.limit = Math.max(1, Math.floor(this.limit / 2))
  }

  get currentLimit(): number {
    return this.limit
  }
}

/** `HTTP 429` (only reached once `fetchWithRetry` exhausts its own retries) reads as a rate-limit signal too, not just `onRetry` — the fallback that also makes this testable through a plain `fetchPage` mock. */
function isRateLimitError(result: WikitextResult): boolean {
  return result.status === 'error' && /\b429\b/u.test(result.message)
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
    fetchPage,
    onProgress,
  } = options

  mkdirSync(cacheDir, { recursive: true })

  const result: PageCacheResult = { fetched: 0, missing: 0, skipped: 0, failed: [] }
  const pace = makePacer(delayMs)
  const gate = new AdaptiveConcurrency(Math.max(1, Math.trunc(concurrency) || 1))

  // The default path wires the governor to `onRetry`, which fires the moment
  // a 429 is *seen* rather than only once a request finally gives up on it —
  // an injected `fetchPage` (tests, local-dump runs) has no such signal, so it
  // falls back to the `isRateLimitError` check below on the settled result.
  const resolvedFetchPage =
    fetchPage ??
    ((title: string) =>
      fetchWikitextResult(title, {
        onRetry: (status, attempt, waitMs) => {
          logRetryToStderr(status, attempt, waitMs)
          gate.reportThrottle()
        },
      }))

  let done = 0

  async function processOne(headword: string): Promise<void> {
    const page = pagePath(headword, cacheDir)
    const miss = missPath(headword, cacheDir)

    if (resume && (existsSync(page) || existsSync(miss))) {
      result.skipped += 1
    } else {
      await pace()
      const fetched = await resolvedFetchPage(headword).catch(
        (e: unknown): WikitextResult => ({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
      )

      // A default (non-resume) re-sync overwrites, so the previous run's
      // answer for this headword has to go — otherwise a stale `.miss` sits
      // next to a fresh page and readers see both.
      if (fetched.status === 'ok') {
        writeAtomic(page, fetched.wikitext)
        rmSync(miss, { force: true })
        result.fetched += 1
        gate.reportSuccess()
      } else if (fetched.status === 'missing') {
        writeAtomic(miss, '')
        rmSync(page, { force: true })
        result.missing += 1
        gate.reportSuccess()
      } else {
        result.failed.push(headword)
        if (isRateLimitError(fetched)) gate.reportThrottle()
        else gate.resetStreak()
      }
    }

    done += 1
    onProgress?.(done, headwords.length, result, gate.currentLimit)
  }

  const pending: Promise<void>[] = []
  for (const headword of headwords) {
    await gate.acquire()
    pending.push(processOne(headword).finally(() => gate.release()))
  }
  await Promise.all(pending)

  return result
}
