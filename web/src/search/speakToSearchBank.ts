import type { MfccParams } from '@teochew/core'

/**
 * The precomputed MFCC reference bank for speak-to-search (issue #279's web
 * follow-up), built offline by `npm run audio:build-search-bank` and synced
 * into `web/public/data/` alongside `dict.json`/`sounds.json` — see
 * `web/scripts/sync-data.mjs`. Unlike those, its absence isn't fatal: a
 * checkout that hasn't run that command simply has no reference bank to
 * fetch, and the mic button surfaces that as an error rather than the app
 * failing to load.
 */
export interface SearchBank {
  version: number
  params: MfccParams
  speaker: string
  variety: string
  clips: Record<string, number[][]>
}

let cached: Promise<SearchBank> | null = null

function bankUrl(): string {
  return `${import.meta.env.BASE_URL}data/audio-search-bank.json`
}

/**
 * Fetched lazily, on first mic use rather than on page load — at several MB,
 * this follows the same "don't download the big thing until asked" rule as
 * `dict.json`'s opt-in offline caching (`../pwa/offlineData.ts`). Memoized
 * for the lifetime of the page: a second mic use doesn't refetch.
 */
export function loadSearchBank(): Promise<SearchBank> {
  cached ??= fetch(bankUrl())
    .then((res) => {
      if (!res.ok) throw new Error(`no speak-to-search reference bank at ${bankUrl()} (HTTP ${res.status})`)
      return res.json() as Promise<SearchBank>
    })
    .catch((e: unknown) => {
      // A transient failure (offline, flaky network) shouldn't permanently
      // wedge the feature for the rest of the session — the next mic use
      // gets to retry the fetch instead of replaying this same rejection.
      cached = null
      throw e
    })
  return cached
}
