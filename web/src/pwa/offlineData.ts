/**
 * dict.json is 41MB decoded / 2.5MB gzipped (mobile.md §2.5) — writing that
 * to someone's phone without asking is hostile, and it's a large share of a
 * constrained iOS storage quota. So it's never precached by the service
 * worker (vite.config.ts's globIgnores); this is the opt-in instead, using
 * the Cache Storage API directly rather than a service-worker route, so
 * "available offline" means exactly what the person on the Settings screen
 * asked for — no more, no less.
 */
const CACHE_NAME = 'teochew-dictionary:offline-data/v1'

function dictUrl(): string {
  return `${import.meta.env.BASE_URL}data/dict.json`
}

function cachesSupported(): boolean {
  return typeof caches !== 'undefined'
}

/** useDictionary's own fetch — served from the offline cache when present, straight from the network otherwise. */
export async function fetchDict(): Promise<Response> {
  if (cachesSupported()) {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(dictUrl())
    if (cached) return cached
  }
  return fetch(dictUrl())
}

export async function isDictAvailableOffline(): Promise<boolean> {
  if (!cachesSupported()) return false
  const cache = await caches.open(CACHE_NAME)
  return (await cache.match(dictUrl())) !== undefined
}

/** Content-Length off a HEAD request, for naming the size before committing to the download (mobile.md §9). Null if the server doesn't say. */
export async function fetchDictSize(): Promise<number | null> {
  try {
    const res = await fetch(dictUrl(), { method: 'HEAD' })
    const len = res.headers.get('content-length')
    return len ? Number(len) : null
  } catch {
    return null
  }
}

/** Fetches dict.json fresh and stores it — re-running this while already enabled refreshes the cached copy. */
export async function enableDictOffline(): Promise<void> {
  if (!cachesSupported()) throw new Error('This browser has no offline storage to use.')
  const res = await fetch(dictUrl())
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
  const cache = await caches.open(CACHE_NAME)
  await cache.put(dictUrl(), res)
}

export async function disableDictOffline(): Promise<void> {
  if (!cachesSupported()) return
  const cache = await caches.open(CACHE_NAME)
  await cache.delete(dictUrl())
}
