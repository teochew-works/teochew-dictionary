import Fuse from 'fuse.js'
import type { EnrichedEntry } from '../types/dict'

/**
 * Fuse.js over the pre-computed search_keys (headword, variants, Peng'im with
 * and without tones, POJ with and without diacritics, English glosses — see
 * src/build/enrich.ts) so the frontend doesn't re-derive any matching logic.
 * headword itself is weighted higher since an exact/near-exact character match
 * is almost always what a user searching by hanzi wants first.
 */
export function createSearchIndex(entries: EnrichedEntry[]): Fuse<EnrichedEntry> {
  return new Fuse(entries, {
    keys: [
      { name: 'headword', weight: 3 },
      { name: 'search_keys', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  })
}

export function search(index: Fuse<EnrichedEntry>, query: string): EnrichedEntry[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  return index.search(trimmed).map((result) => result.item)
}
