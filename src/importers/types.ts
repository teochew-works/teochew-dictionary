/** Shared across every importer that fetches from a live site. */
export const IMPORTER_USER_AGENT = 'teochew-dictionary importer (github; contact via repo)'

export interface RetryOptions {
  /** Retries on 429 before giving up. */
  maxRetries?: number
  /** Backoff when the response carries no `retry-after` header. */
  backoffMs?: number
  /**
   * Deadline applied fresh to *each* attempt, so a request that stalls gets
   * cancelled without eating into another attempt's budget. Deliberately not
   * a single deadline for the whole retry sequence: `backoffMs` alone can sum
   * past a typical timeout well before `maxRetries` is reached (2s+4s+8s+16s
   * already exceeds a 30s budget), which would abort a request that was
   * genuinely on track to succeed after backing off from a 429 — the
   * situation `retry-after` handling above exists for in the first place.
   */
  timeoutMs?: number
  /**
   * Fired the moment a 429 is seen, before the backoff wait — a caller that
   * wants to react to rate-limiting (e.g. an adaptive concurrency governor)
   * otherwise has no signal until the whole retry sequence either succeeds or
   * exhausts `maxRetries`, by which point real time has already been lost.
   */
  onRetry?: (status: number, attempt: number, waitMs: number) => void
}

/**
 * `fetch` that retries on HTTP 429, honoring the `retry-after` header when
 * present. Wikimedia's edge rate limiter sends one (confirmed live, issue
 * #54's bulk run trips it well before any per-request delay would suggest) —
 * falls back to exponential backoff otherwise.
 */
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const { maxRetries = 5, backoffMs = 2000, timeoutMs, onRetry } = options

  for (let attempt = 0; ; attempt += 1) {
    const attemptInit = timeoutMs !== undefined ? { ...init, signal: AbortSignal.timeout(timeoutMs) } : init
    const res = await fetch(url, attemptInit)
    if (res.status !== 429 || attempt >= maxRetries) return res

    const retryAfter = Number(res.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt
    onRetry?.(res.status, attempt, waitMs)
    await new Promise((r) => setTimeout(r, waitMs))
  }
}

/**
 * Importers never write to `data/entries/`.
 *
 * They emit *proposals* into `data/staging/`, which a human reviews and merges.
 * Two reasons, both learned the hard way by other lexicon projects:
 *
 *  1. Licence hygiene. Imported glosses carry their own licence (CC-BY-SA for
 *     Wiktionary and CC-CEDICT). Keeping them separable until a human accepts
 *     them means the provenance recorded on the entry is actually true.
 *  2. Quality. Automatic extraction of Teochew readings is unreliable enough
 *     that unattended merging would degrade a hand-curated dataset.
 */

export interface ProposedReading {
  pengim: string
  variety?: string
  register?: string
  note?: string
}

export interface ProposedSense {
  pos?: string
  gloss_en: string[]
  gloss_zh?: string[]
}

/** A suggested new entry, or a suggested addition to an existing one. */
export interface Proposal {
  /** Existing entry id when this augments one; absent for a wholly new entry. */
  target_id?: string
  headword: string
  readings?: ProposedReading[]
  senses?: ProposedSense[]
  source: string
  retrieved: string
  /** Why a human should look at this — ambiguity, low confidence, conflicts. */
  flags?: string[]
}

export interface ImportResult {
  source: string
  proposals: Proposal[]
  /** Headwords the importer looked for but could not resolve. */
  misses: string[]
  notes: string[]
}
