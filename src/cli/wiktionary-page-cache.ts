import { symlinkSync } from 'node:fs'

import { loadWiktionaryWordlist } from '../data/wiktionary-wordlist.js'
import {
  cacheFileName,
  checkCacheSymlink,
  findMainWorktreeCacheTarget,
  isCached,
  syncWiktionaryPages,
  type CacheSymlinkStatus,
  type PageCacheResult,
} from '../importers/wiktionary-cache.js'
import { CACHE_DIR, WIKTIONARY_PAGE_CACHE_DIR } from '../paths.js'
import { dim, green, red, yellow } from './colour.js'

/**
 * `npm run cache:wiktionary -- [--resume] [--limit=N] [--delay=MS]
 *  [--concurrency=N] [--progress] [headword...]` (issue #79)
 *
 * Bulk-downloads each candidate headword's raw Wiktionary wikitext into
 * .cache/wiktionary-pages/, so the hand-merge work of issue #68 stops paying
 * for the same page twice (once to draft an entry, again to audit it) and so
 * an interrupted run loses only its reasoning, not its downloads.
 *
 * Network-touching, so deliberately kept out of `npm run check` — same reason
 * `npm run import`/`npm run xref`/`npm run audio:verify` are excluded.
 *
 * `--concurrency` is a ceiling, not a fixed worker count: the run starts at 1
 * request in flight and adds one more after every 5 clean completions, back
 * down to half the moment a 429 shows up. See `AdaptiveConcurrency` in
 * ../importers/wiktionary-cache.js.
 *
 * Fetch-only. Nothing in this repo reads the cache yet; wiring the drafting
 * and audit passes to it is a separate follow-on to #79.
 */

const USAGE = `usage:
  npm run cache:wiktionary                     every headword in the wordlist, whatever its status
  npm run cache:wiktionary -- --resume         skip headwords already cached on disk
  npm run cache:wiktionary -- --limit=500      cap this run to N headwords
  npm run cache:wiktionary -- --delay=200      ms between requests (default 200)
  npm run cache:wiktionary -- --concurrency=4  ceiling on requests in flight; ramps up from 1, halves on a 429 (default 1)
  npm run cache:wiktionary -- --progress       redraw a live progress bar instead of periodic lines
  npm run cache:wiktionary -- 挪威 挫折          ad-hoc headwords, bypassing the wordlist

Writes <headword>.wikitext (or an empty <headword>.miss) to .cache/wiktionary-pages/.`

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

// The cache can grow to tens of thousands of files, so `.cache` is meant to
// be a symlink out to wherever the operator actually wants it to live rather
// than a plain directory left to accumulate inside the worktree. Refuse
// outright rather than have mkdirSync silently create one in its place.
function describeCacheIssue(status: Extract<CacheSymlinkStatus, { valid: false }>): string {
  switch (status.reason) {
    case 'missing':
      return `${CACHE_DIR} does not exist`
    case 'not-a-symlink':
      return `${CACHE_DIR} exists but is not a symlink`
    case 'broken':
      return `${CACHE_DIR} is a symlink, but its target does not exist`
    case 'not-a-directory':
      return `${CACHE_DIR} is a symlink, but its target is not a directory`
  }
}

let symlinkStatus = checkCacheSymlink()

// A brand-new worktree of this repo starts with no `.cache` of its own, even
// though the main checkout usually already has one — mirror that instead of
// making every worktree an operator has to link by hand. Only for the
// `missing` case: a `.cache` that exists but is broken or the wrong kind of
// thing is left for the refusal below, not silently relinked.
if (!symlinkStatus.valid && symlinkStatus.reason === 'missing') {
  const mainTarget = findMainWorktreeCacheTarget()
  if (mainTarget) {
    symlinkSync(mainTarget, CACHE_DIR)
    console.log(dim(`linked .cache → ${mainTarget} (matching the main checkout)`))
    symlinkStatus = checkCacheSymlink()
  }
}

if (!symlinkStatus.valid) {
  console.error(red(`refusing to sync: ${describeCacheIssue(symlinkStatus)}`))
  console.error(`expected .cache to be a symlink to an external cache directory, e.g.:`)
  console.error(`  ln -s /path/to/your/wiktionary-page-cache ${CACHE_DIR}`)
  process.exit(1)
}

const flags = args.filter((a) => a.startsWith('--'))
const explicitHeadwords = args.filter((a) => !a.startsWith('--'))

function numberFlag(name: string): number | undefined {
  const prefix = `--${name}=`
  const flag = flags.find((f) => f.startsWith(prefix))
  if (!flag) return undefined
  const value = Number(flag.slice(prefix.length))
  if (!Number.isFinite(value) || value < 0) {
    console.error(`${flag}: expected a non-negative number\n\n${USAGE}`)
    process.exit(2)
  }
  return value
}

const unknown = flags.filter(
  (f) => !['--resume', '--continue', '--progress'].includes(f) && !/^--(limit|delay|concurrency)=/u.test(f),
)
if (unknown.length > 0) {
  console.error(`unknown flag(s): ${unknown.join(' ')}\n\n${USAGE}`)
  process.exit(2)
}

const resume = flags.includes('--resume') || flags.includes('--continue')
const limit = numberFlag('limit')
const delayMs = numberFlag('delay')
const concurrency = numberFlag('concurrency')
// Redrawing a line with `\r` garbles output that isn't a real terminal (a log
// file, CI capture), so --progress only switches on the bar when stdout is
// actually a TTY — otherwise it silently falls back to the periodic lines
// below, same as leaving the flag off.
const showProgressBar = flags.includes('--progress') && process.stdout.isTTY

// Default scope is deliberately every headword on record, not just the
// `staged` ones: caching only what is pending would leave already-merged
// (`existing`) entries' source pages unavailable for exactly the
// re-verification passes this cache is meant to serve.
const source = explicitHeadwords.length > 0 ? 'argv' : 'wordlist'
let candidates: string[]

if (source === 'argv') {
  candidates = explicitHeadwords
} else {
  const wordlist = loadWiktionaryWordlist()
  if (!wordlist) {
    console.error(
      'no data/wordlists/wiktionary-teochew-index.yaml — run `npm run wordlist:wiktionary` first',
    )
    process.exit(1)
  }
  candidates = wordlist.items.map((item) => item.headword)
}

// On a case-insensitive filesystem these would silently share one cache file,
// so say so rather than letting one headword's page masquerade as another's.
const byLowercasedName = new Map<string, string[]>()
for (const headword of candidates) {
  const key = cacheFileName(headword).toLowerCase()
  byLowercasedName.set(key, [...(byLowercasedName.get(key) ?? []), headword])
}
for (const group of byLowercasedName.values()) {
  if (group.length > 1) {
    console.error(yellow(`warning: ${group.join(', ')} share a cache filename on a case-insensitive filesystem`))
  }
}

// Under --resume, --limit has to mean "N headwords actually fetched" rather
// than "N considered" — otherwise a chunked run past the halfway mark spends
// most of each invocation confirming files it already has.
const pending = resume ? candidates.filter((headword) => !isCached(headword)) : candidates
const alreadyCached = candidates.length - pending.length
const headwords = limit !== undefined ? pending.slice(0, limit) : pending

if (resume && alreadyCached > 0) {
  console.log(dim(`${alreadyCached} of ${candidates.length} headword(s) already cached — skipping`))
}

if (headwords.length === 0) {
  // Not always the resume case: `--limit=0`, or an empty wordlist, land here too.
  console.log(green(resume ? 'nothing to fetch: every requested headword is already cached' : 'nothing to fetch'))
  process.exit(0)
}

console.log(
  `fetching ${headwords.length} Wiktionary page(s) from the ${source}` +
    dim(` (delay ${delayMs ?? 200}ms, concurrency ≤${concurrency ?? 1}, adaptive)`),
)

const PROGRESS_EVERY = 100
const PROGRESS_BAR_WIDTH = 24

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '?'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`
}

function renderProgressBar(
  done: number,
  total: number,
  running: PageCacheResult,
  elapsedMs: number,
  currentConcurrency: number,
): string {
  const ratio = total === 0 ? 1 : done / total
  const filled = Math.round(PROGRESS_BAR_WIDTH * ratio)
  const bar = '█'.repeat(filled) + '░'.repeat(PROGRESS_BAR_WIDTH - filled)
  const rate = elapsedMs > 0 ? done / (elapsedMs / 1000) : 0
  const eta = rate > 0 ? formatDuration((total - done) / rate) : '?'
  return (
    `[${bar}] ${done}/${total} (${Math.round(ratio * 100)}%) — ` +
    `${running.fetched} page(s), ${running.missing} miss(es), ${running.failed.length} failed — ` +
    `${rate.toFixed(2)} req/s, concurrency ${currentConcurrency} — ETA ${eta}`
  )
}

const startedAt = Date.now()

const result = await syncWiktionaryPages(headwords, {
  resume,
  ...(delayMs !== undefined ? { delayMs } : {}),
  ...(concurrency !== undefined ? { concurrency } : {}),
  onProgress: (done, total, running, currentConcurrency) => {
    if (showProgressBar) {
      const line = renderProgressBar(done, total, running, Date.now() - startedAt, currentConcurrency)
      process.stdout.write(`\r${dim(line)}\x1b[K`)
      if (done === total) process.stdout.write('\n')
      return
    }
    if (done % PROGRESS_EVERY !== 0 && done !== total) return
    console.log(
      dim(
        `  ${done}/${total} — ${running.fetched} page(s), ${running.missing} miss(es), ` +
          `${running.failed.length} failed — concurrency ${currentConcurrency}`,
      ),
    )
  },
})

console.log(`→ ${WIKTIONARY_PAGE_CACHE_DIR}`)
console.log(`  ${result.fetched} page(s) written`)
console.log(`  ${result.missing} headword(s) with no Wiktionary page (recorded as .miss)`)
if (result.skipped > 0) console.log(`  ${result.skipped} skipped (already cached)`)

if (result.failed.length > 0) {
  const shown = result.failed.slice(0, 10).join(', ')
  const more = result.failed.length > 10 ? `, … (${result.failed.length - 10} more)` : ''
  console.log(yellow(`  ${result.failed.length} request(s) failed: ${shown}${more}`))
  // Nothing was written for these, on purpose — a transient failure must not
  // become a permanent `.miss` that --resume then never revisits.
  console.log(dim('  re-run with --resume to retry only those'))
} else {
  console.log(green('✓ every requested headword has a settled answer on disk'))
}
