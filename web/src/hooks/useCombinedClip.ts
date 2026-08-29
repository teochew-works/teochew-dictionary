import { useCallback, useRef, useState } from 'react'
import { synthesizeCombinedClip } from '../audio/combineClips'

export type CombinedClipStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Survives component remounts (EntryDetail is deliberately re-keyed per
 * entry — selecting another entry remounts the pane) and de-dupes concurrent
 * requests: caching the Promise, not just the resolved buffer, means a
 * second click while synthesis is in flight reuses the same in-progress
 * request instead of starting a second one. No eviction — the current
 * dataset is small enough (~100 clips total) that unbounded growth isn't a
 * near-term concern.
 */
const promiseCache = new Map<string, Promise<AudioBuffer>>()

/**
 * Tracks combined-clip synthesis status for however many distinct readings a
 * caller needs (e.g. one per reading on a multi-reading entry) from a single
 * hook instance — callers key by their own clip-url list rather than this
 * hook being called once per reading, which would violate the rules of hooks
 * for a variable-length `.map()`.
 */
export function useCombinedClip() {
  const [statuses, setStatuses] = useState<Record<string, CombinedClipStatus>>({})
  const requestIdRef = useRef<Record<string, number>>({})

  // Only synthesizes on demand (first call for a given key), not on render —
  // most readings never get their combined button clicked, and most don't
  // even offer one (see canCombine in search/filters.ts).
  const ensure = useCallback((urls: string[]): Promise<AudioBuffer> => {
    const key = urls.join('|')

    let promise = promiseCache.get(key)
    if (!promise) {
      promise = synthesizeCombinedClip(urls)
      promiseCache.set(key, promise)
    }

    const requestId = (requestIdRef.current[key] ?? 0) + 1
    requestIdRef.current[key] = requestId
    setStatuses((prev) => ({ ...prev, [key]: 'loading' }))
    promise.then(
      () => {
        if (requestIdRef.current[key] === requestId) setStatuses((prev) => ({ ...prev, [key]: 'ready' }))
      },
      () => {
        // A transient failure (e.g. a retagged release asset) shouldn't be cached forever.
        promiseCache.delete(key)
        if (requestIdRef.current[key] === requestId) setStatuses((prev) => ({ ...prev, [key]: 'error' }))
      },
    )
    return promise
  }, [])

  const statusFor = useCallback((urls: string[]): CombinedClipStatus => statuses[urls.join('|')] ?? 'idle', [statuses])

  return { statusFor, ensure }
}
