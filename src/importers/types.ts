/**
 * Shared across every importer that fetches from a live site.
 *
 * Must carry a real, dereferenceable contact URL, not just a vague pointer
 * like "contact via repo" — Wikimedia's User-Agent policy
 * (https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)
 * blocks non-compliant clients, and the block does not expire on a
 * `retry-after` timer the way a normal rate limit does. Confirmed live: the
 * old string got a 429 on every request to upload.wikimedia.org regardless
 * of how long the caller waited, while this exact URL got 200 immediately.
 */
export const IMPORTER_USER_AGENT =
  'teochew-dictionary-importer/1.0 (https://github.com/teochew-works/teochew-dictionary)'

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
   * Upper bound on any single wait, including a server-supplied
   * `retry-after` — left uncapped, a large header can stall a call for as
   * long as the server asks, up to `maxRetries` times over (issue #125: a
   * `retry-after: 600` with the default `maxRetries` costs up to ~50
   * minutes, silently). Defaults to 60s: generous next to a normal
   * rate-limit clear, short enough that a live retry doesn't read as a hung
   * process.
   */
  maxWaitMs?: number
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
  const { maxRetries = 5, backoffMs = 2000, timeoutMs, maxWaitMs = 60_000, onRetry } = options

  for (let attempt = 0; ; attempt += 1) {
    const attemptInit = timeoutMs !== undefined ? { ...init, signal: AbortSignal.timeout(timeoutMs) } : init
    const res = await fetch(url, attemptInit)
    if (res.status !== 429 || attempt >= maxRetries) return res

    const retryAfter = Number(res.headers.get('retry-after'))
    const rawWaitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt
    const waitMs = Math.min(rawWaitMs, maxWaitMs)
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
  /**
   * Absent for a sense staged purely for its `tags`/`topics`/`alt_of` signal —
   * the Wiktionary importer never fetches a gloss (licence hygiene: readings
   * and glosses are separate decisions, see ./wiktionary.js).
   */
  gloss_en?: string[]
  gloss_zh?: string[]
  tags?: string[]
  topics?: string[]
  alt_of?: string[]
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
