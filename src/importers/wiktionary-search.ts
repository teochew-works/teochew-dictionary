import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'

/**
 * Enumerates every Wiktionary page that declares a Teochew reading, via
 * CirrusSearch's `insource:/regex/` full-text search (issue #54) — the direct
 * alternative to guessing candidates from a frequency list (issue #53).
 *
 * `insource:/mn-t=/` matches any page whose wikitext contains the `mn-t=`
 * parameter of a `{{zh-pron}}` template (see `wiktionary.ts` for what that
 * looks like). Namespace 0 only, so talk/reconstruction pages are excluded.
 *
 * CirrusSearch refuses `sroffset` >= 10000 ("Up to 10000 search results are
 * supported"), confirmed live against `insource:/mn-t=/`'s ~17,213 hits — a
 * single un-partitioned query cannot page through the whole result set. So
 * when the plain query is too big, this recursively bisects the *Basic
 * Multilingual Plane* range of a title's first character
 * (`intitle:/^[start-end]/`) until each (sub-)range is small enough to page
 * through directly.
 *
 * BMP-only is deliberate, not an oversight: CirrusSearch's character-class
 * ranges only behave correctly when both bounds are within the BMP — a range
 * with an astral (>U+FFFF) bound was confirmed live to silently match the
 * wrong set (e.g. `[U+0000-U+87FFF]` over-matched to the *entire* result set,
 * and `[U+10000-U+10FFFF]` matched titles starting with plain ASCII letters).
 * Real astral-titled pages exist for this lexicon — dialectal Southern Min
 * characters outside the common CJK blocks — so one additional negated query,
 * `-intitle:/^[<BMP_MIN>-<BMP_MAX>]/`, catches everything the BMP sweep
 * didn't, without ever putting an astral codepoint inside a range.
 */

const API = 'https://en.wiktionary.org/w/api.php'
const BASE_QUERY = 'insource:/mn-t=/'
const PAGE_SIZE = 500
/** MediaWiki titles can't start with control characters, so this loses nothing real. */
const BMP_MIN = 0x0020
const BMP_MAX = 0xffff

export interface SearchPage {
  titles: string[]
  totalHits: number
  /** Offset for the next call within this query, or null when this was the last page. */
  nextOffset: number | null
}

interface CodepointRange {
  start: number
  end: number
}

function bmpRangeQuery(range: CodepointRange): string {
  return `${BASE_QUERY} intitle:/^[${String.fromCodePoint(range.start)}-${String.fromCodePoint(range.end)}]/`
}

function astralCatchAllQuery(): string {
  return `${BASE_QUERY} -intitle:/^[${String.fromCodePoint(BMP_MIN)}-${String.fromCodePoint(BMP_MAX)}]/`
}

async function requestSearchPage(query: string, offset: number): Promise<SearchPage> {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: String(PAGE_SIZE),
    sroffset: String(offset),
    format: 'json',
    formatversion: '2',
  }).toString()

  const res = await fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } })
  if (!res.ok) throw new Error(`Wiktionary search API returned ${res.status}`)

  const body = (await res.json()) as {
    error?: { code?: string; info?: string }
    continue?: { sroffset?: number }
    query?: { search?: { title: string }[]; searchinfo?: { totalhits?: number } }
  }

  // MediaWiki reports API-level failures (e.g. an invalid `intitle:` regex from
  // a bisected range — see the module doc comment) as HTTP 200 with an `error`
  // body, not a non-2xx status. Left unchecked, `body.query` being undefined
  // would fall through to the `?? []` / `?? 0` defaults below and get silently
  // read as "zero hits", dropping that entire subrange with no error surfaced.
  if (body.error) {
    throw new Error(`Wiktionary search API error for query ${JSON.stringify(query)}: ${body.error.code} — ${body.error.info}`)
  }

  return {
    titles: (body.query?.search ?? []).map((r) => r.title),
    totalHits: body.query?.searchinfo?.totalhits ?? 0,
    nextOffset: body.continue?.sroffset ?? null,
  }
}

export interface SearchOptions {
  /** Milliseconds between calls. Wiktionary asks clients to be gentle. */
  delayMs?: number
  /** Injectable for tests and for running against a local dump. */
  fetchSearchPage?: (query: string, offset: number) => Promise<SearchPage>
  /** Called after each page is fetched, for progress reporting. */
  onPage?: (page: SearchPage, query: string, offset: number) => void
  /** Safety margin under CirrusSearch's confirmed 10,000 sroffset cap. */
  maxOffset?: number
  /** Backstop against runaway bisection; real content needs nowhere near this. */
  maxRanges?: number
}

/** Paginates the full `insource:/mn-t=/` result set into a deduped, sorted title list. */
export async function searchTeochewPages(options: SearchOptions = {}): Promise<string[]> {
  const {
    delayMs = 200,
    fetchSearchPage = requestSearchPage,
    onPage,
    maxOffset = 9500,
    maxRanges = 500,
  } = options

  const titles = new Set<string>()
  let first = true

  async function fetchWithDelay(query: string, offset: number): Promise<SearchPage> {
    if (!first && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    first = false
    const page = await fetchSearchPage(query, offset)
    onPage?.(page, query, offset)
    return page
  }

  /** Pages through `query` and merges into `titles`, or bails out (no side effect) once totalHits exceeds maxOffset. */
  async function paginateIfSmallEnough(query: string): Promise<boolean> {
    const collected: string[] = []
    let offset = 0
    for (;;) {
      const page = await fetchWithDelay(query, offset)
      if (page.totalHits > maxOffset) return false
      collected.push(...page.titles)
      if (page.nextOffset === null) break
      offset = page.nextOffset
    }
    for (const t of collected) titles.add(t)
    return true
  }

  // Fast path: most result sets (or a smaller future run of this lexicon)
  // fit under the cap with no partitioning at all.
  if (await paginateIfSmallEnough(BASE_QUERY)) {
    return [...titles].sort()
  }

  // Slow path: bisect within the BMP; see the module doc comment for why.
  const queue: CodepointRange[] = [{ start: BMP_MIN, end: BMP_MAX }]
  let rangesProcessed = 0

  while (queue.length > 0) {
    if (rangesProcessed >= maxRanges) {
      throw new Error(`searchTeochewPages: exceeded maxRanges (${maxRanges}) — result set may be pathological`)
    }
    rangesProcessed += 1

    const range = queue.shift()!
    if (await paginateIfSmallEnough(bmpRangeQuery(range))) continue

    if (range.start === range.end) {
      throw new Error(
        `searchTeochewPages: more than ${maxOffset} pages start with U+${range.start.toString(16).padStart(4, '0')} — cannot paginate further`,
      )
    }
    const mid = range.start + Math.floor((range.end - range.start) / 2)
    queue.push({ start: range.start, end: mid }, { start: mid + 1, end: range.end })
  }

  if (!(await paginateIfSmallEnough(astralCatchAllQuery()))) {
    throw new Error(
      `searchTeochewPages: astral-title catch-all exceeded ${maxOffset} results — needs a dedicated split strategy`,
    )
  }

  // Plain code-unit order, not localeCompare: deterministic across Node builds
  // regardless of ICU data, which matters for a list this large and committed.
  return [...titles].sort()
}
