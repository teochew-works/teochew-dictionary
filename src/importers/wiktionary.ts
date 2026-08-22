import { tryParsePengim } from '../phonology/syllable.js'
import {
  fetchWithRetry,
  IMPORTER_USER_AGENT,
  type ImportResult,
  type Proposal,
  type ProposedReading,
  type ProposedSense,
} from './types.js'
import { loadWiktextractIndex, type WiktextractRecord } from './wiktextract.js'
import { extractAltOf, mapWiktextractTags } from './wiktionary-tags.js'

/**
 * Wiktionary importer — the one open source that actually carries Teochew
 * pronunciations.
 *
 * Teochew readings live in the `{{zh-pron}}` template under the `mn-t`
 * parameter, in Peng'im, e.g.
 *
 *     {{zh-pron
 *     |m=cháozhōu
 *     |mn-t=dio5 ziu1/diê5 ziu1
 *     }}
 *
 * Extraction is regex-based rather than a full wikitext parse. That is a
 * deliberate trade: a complete parser is a large piece of work, and every
 * candidate reading goes through Peng'im validation and then human review
 * before it can reach the dataset, so a mis-extraction is caught rather than
 * silently absorbed.
 */

const API = 'https://en.wiktionary.org/w/api.php'

/**
 * Without a deadline a stalled connection hangs the whole run. Measured on a
 * bulk sync: most requests answer in well under a second, but roughly one in
 * ten stalls, and before this existed those stalls ran past a minute with
 * nothing ever cancelling them. Same 30s budget `verifyAudioRemote` uses for
 * the other bulk-fetch command — generous next to a healthy request, which is
 * the point: it fires on dead connections, not slow ones.
 *
 * Applied per attempt (via `fetchWithRetry`'s `timeoutMs`), not once for the
 * whole retry sequence — a 429 backoff can legitimately run past 30s of
 * *waiting* without any single request having stalled.
 */
const FETCH_TIMEOUT_MS = 30_000

/** `mn-t=` or `mn_t=`, up to the next `|` or `}}`. */
const MN_T = /\|\s*mn[-_]t\s*=\s*([^|}\n]+)/giu

export function extractTeochewReadings(wikitext: string): string[] {
  const out: string[] = []
  for (const m of wikitext.matchAll(MN_T)) {
    // Strip markup BEFORE splitting: a `</ref>` contains a slash, and splitting
    // first would tear it into two bogus "readings".
    const cleaned = m[1]!
      .replace(/<ref[^>]*>.*?<\/ref>/giu, '') // footnotes, content and all
      .replace(/<[^>]*>/gu, '') // any remaining inline tags
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/gu, '$2') // unwrap wikilinks
      .replace(/'{2,}/gu, '') // wiki bold/italic

    // A single parameter may hold several readings separated by `/` or `,`.
    for (const part of cleaned.split(/[/,]/u)) {
      const reading = part.trim()
      if (reading) out.push(reading)
    }
  }
  return [...new Set(out)]
}

/**
 * Why three states rather than `string | null`: "Wiktionary has no such page"
 * and "the network ate the request" need telling apart by anything that
 * *records* the outcome. The page cache (`./wiktionary-cache.js`, issue #79)
 * writes a permanent `.miss` marker for the former and would otherwise bake a
 * transient failure into the cache, never retrying it.
 *
 * `importWiktionary` itself doesn't care — a headword it couldn't resolve is a
 * miss either way — so it keeps using the flattening wrapper below.
 */
export type WikitextResult =
  | { status: 'ok'; wikitext: string }
  /** The API answered, and there is no page (or no wikitext) under that title. */
  | { status: 'missing' }
  /** The API did not answer usefully: transport failure, non-2xx, or an API error. */
  | { status: 'error'; message: string }

export interface FetchWikitextOptions {
  /** See `RetryOptions.onRetry` — fires the moment a 429 is seen, not just on exhaustion. */
  onRetry?: (status: number, attempt: number, waitMs: number) => void
}

export async function fetchWikitextResult(
  title: string,
  options: FetchWikitextOptions = {},
): Promise<WikitextResult> {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
  }).toString()

  let res: Response
  try {
    res = await fetchWithRetry(
      url,
      { headers: { 'user-agent': IMPORTER_USER_AGENT } },
      { timeoutMs: FETCH_TIMEOUT_MS, onRetry: options.onRetry },
    )
  } catch (e) {
    // A timeout lands here as an abort. Reporting it as an error rather than a
    // miss is the point: the caller retries it instead of recording "no such
    // page" for something that merely timed out.
    return { status: 'error', message: e instanceof Error ? e.message : String(e) }
  }

  // A title that doesn't exist comes back as HTTP *200* carrying an
  // `error.code: missingtitle` body (confirmed live), so `res.ok` alone doesn't
  // mean the page was found — read the body before judging either way.
  let body: { parse?: { wikitext?: string }; error?: { code?: string; info?: string } }
  try {
    body = (await res.json()) as typeof body
  } catch {
    return { status: 'error', message: `HTTP ${res.status} with an unparseable body` }
  }

  if (body.error) {
    // `missingtitle` (and `invalidtitle`, for a title Wiktionary can never
    // hold) are settled answers: there is nothing to fetch, now or later.
    const code = body.error.code
    if (code === 'missingtitle' || code === 'invalidtitle') return { status: 'missing' }
    return { status: 'error', message: `API error '${code ?? 'unknown'}': ${body.error.info ?? ''}`.trim() }
  }

  if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` }

  const wikitext = body.parse?.wikitext
  return wikitext === undefined ? { status: 'missing' } : { status: 'ok', wikitext }
}

async function fetchWikitext(title: string): Promise<string | null> {
  const result = await fetchWikitextResult(title)
  return result.status === 'ok' ? result.wikitext : null
}

/**
 * Builds tag/alt-of-only senses for a headword from the wiktextract index
 * (issue #84/#102) — never a gloss: the importer never fetches one (licence
 * hygiene, see the module doc comment above), so a proposed sense here always
 * omits `gloss_en` and exists purely to carry `tags`/`alt_of` signal for
 * whoever hand-merges the proposal.
 */
export function proposeSensesFromWiktextract(
  headword: string,
  index: Map<string, WiktextractRecord[]>,
): ProposedSense[] {
  const proposed: ProposedSense[] = []
  for (const record of index.get(headword) ?? []) {
    for (const sense of record.senses ?? []) {
      const tags = mapWiktextractTags(sense.tags)
      const alt_of = extractAltOf(sense.alt_of)
      if (tags.length === 0 && alt_of.length === 0) continue
      proposed.push({
        ...(record.pos ? { pos: record.pos } : {}),
        ...(tags.length > 0 ? { tags } : {}),
        ...(alt_of.length > 0 ? { alt_of } : {}),
      })
    }
  }
  return proposed
}

export interface WiktionaryOptions {
  /** Milliseconds between requests. Wiktionary asks clients to be gentle. */
  delayMs?: number
  /** Injectable for tests and for running against a local dump. */
  fetchPage?: (title: string) => Promise<string | null>
  /** Injectable for tests; defaults to loading `.cache/teochew-relevant.min.jsonl` once, lazily. */
  wiktextractIndex?: Map<string, WiktextractRecord[]>
}

export async function importWiktionary(
  headwords: string[],
  retrieved: string,
  options: WiktionaryOptions = {},
): Promise<ImportResult> {
  const { delayMs = 200, fetchPage = fetchWikitext, wiktextractIndex = loadWiktextractIndex() } = options

  const proposals: Proposal[] = []
  const misses: string[] = []
  let rejected = 0

  for (const [i, headword] of headwords.entries()) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))

    const wikitext = await fetchPage(headword).catch(() => null)
    if (!wikitext) {
      misses.push(headword)
      continue
    }

    const candidates = extractTeochewReadings(wikitext)
    if (candidates.length === 0) {
      misses.push(headword)
      continue
    }

    // Only well-formed Peng'im survives. Anything else is reported, not merged.
    const readings: ProposedReading[] = []
    const flags: string[] = []
    for (const c of candidates) {
      const parsed = tryParsePengim(c)
      if (parsed.ok) {
        readings.push({ pengim: c, variety: 'chaozhou' })
      } else {
        rejected += 1
        flags.push(`rejected '${c}': ${parsed.error}`)
      }
    }

    if (readings.length === 0) {
      misses.push(headword)
      continue
    }
    if (readings.length > 1) {
      flags.push(`${readings.length} readings found — confirm which are genuine variants`)
    }

    const senses = proposeSensesFromWiktextract(headword, wiktextractIndex)

    proposals.push({
      headword,
      readings,
      ...(senses.length > 0 ? { senses } : {}),
      source: 'wiktionary',
      retrieved,
      flags,
    })
  }

  return {
    source: 'wiktionary',
    proposals,
    misses,
    notes: [
      `requested ${headwords.length} headwords, resolved ${proposals.length}`,
      `${rejected} candidate reading(s) rejected as malformed Peng'im`,
      'Wiktionary is CC-BY-SA-4.0 — merging binds the dataset to share-alike',
    ],
  }
}

export interface BackfillTagsOptions {
  /** Injectable for tests; defaults to loading `.cache/teochew-relevant.min.jsonl` once, lazily. */
  wiktextractIndex?: Map<string, WiktextractRecord[]>
}

/**
 * Re-derives `tags`/`alt_of` senses for already-staged proposals (issue
 * #102's backfill of the ~15,845 proposals in data/staging/wiktionary.yaml)
 * purely from the local wiktextract cache — no live fetch, so it's cheap to
 * re-run as the cache or the tag mapping in ./wiktionary-tags.js changes.
 */
export function backfillStagedTags(proposals: Proposal[], options: BackfillTagsOptions = {}): Proposal[] {
  const { wiktextractIndex = loadWiktextractIndex() } = options
  return proposals.map((proposal) => {
    const senses = proposeSensesFromWiktextract(proposal.headword, wiktextractIndex)
    return senses.length > 0 ? { ...proposal, senses } : proposal
  })
}
