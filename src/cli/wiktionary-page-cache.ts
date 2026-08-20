import { loadWiktionaryWordlist } from '../data/wiktionary-wordlist.js'
import {
  cacheFileName,
  checkCacheSymlink,
  isCached,
  syncWiktionaryPages,
  type CacheSymlinkStatus,
} from '../importers/wiktionary-cache.js'
import { CACHE_DIR, WIKTIONARY_PAGE_CACHE_DIR } from '../paths.js'
import { dim, green, red, yellow } from './colour.js'

/**
 * `npm run cache:wiktionary -- [--resume] [--limit=N] [--delay=MS]
 *  [--concurrency=N] [headword...]` (issue #79)
 *
 * Bulk-downloads each candidate headword's raw Wiktionary wikitext into
 * .cache/wiktionary-pages/, so the hand-merge work of issue #68 stops paying
 * for the same page twice (once to draft an entry, again to audit it) and so
 * an interrupted run loses only its reasoning, not its downloads.
 *
 * Network-touching, so deliberately kept out of `npm run check` — same reason
 * `npm run import`/`npm run xref`/`npm run audio:verify` are excluded.
 *
 * Fetch-only. Nothing in this repo reads the cache yet; wiring the drafting
 * and audit passes to it is a separate follow-on to #79.
 */

const USAGE = `usage:
  npm run cache:wiktionary                     every headword in the wordlist, whatever its status
  npm run cache:wiktionary -- --resume         skip headwords already cached on disk
  npm run cache:wiktionary -- --limit=500      cap this run to N headwords
  npm run cache:wiktionary -- --delay=200      ms between requests (default 200)
  npm run cache:wiktionary -- --concurrency=4  requests in flight (default 1)
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

const symlinkStatus = checkCacheSymlink()
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
  (f) => !['--resume', '--continue'].includes(f) && !/^--(limit|delay|concurrency)=/u.test(f),
)
if (unknown.length > 0) {
  console.error(`unknown flag(s): ${unknown.join(' ')}\n\n${USAGE}`)
  process.exit(2)
}

const resume = flags.includes('--resume') || flags.includes('--continue')
const limit = numberFlag('limit')
const delayMs = numberFlag('delay')
const concurrency = numberFlag('concurrency')

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
    dim(` (delay ${delayMs ?? 200}ms, concurrency ${concurrency ?? 1})`),
)

const PROGRESS_EVERY = 100

const result = await syncWiktionaryPages(headwords, {
  resume,
  ...(delayMs !== undefined ? { delayMs } : {}),
  ...(concurrency !== undefined ? { concurrency } : {}),
  onProgress: (done, total, running) => {
    if (done % PROGRESS_EVERY !== 0 && done !== total) return
    console.log(
      dim(`  ${done}/${total} — ${running.fetched} page(s), ${running.missing} miss(es), ${running.failed.length} failed`),
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
