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
    // Fuse allows roughly `threshold * query.length` character errors, so a
    // loose threshold is punishing for the short queries people actually type:
    // at 0.35 a 4-char query got one free error anywhere in a key, and "wood"
    // returned 383 of 16k entries — 340 of which contained no "wood" at all,
    // having matched via "blood", "flood", "good", "food"… 0.2 keeps short
    // queries to literal matches while still absorbing typos in the longer
    // Peng'im/POJ strings ("diozui" still finds 潮州, "vegtable" still finds 菜).
    threshold: 0.2,
    ignoreLocation: true,
  })
}

/**
 * How literally an entry matches, best tier first. Fuse scores a substring hit
 * the same wherever it lands, so "eat" ranked 肉醬 ("meat paste"), 暖氣
 * ("heating") and 中暑 ("to suffer heatstroke") above 食 ("to eat") — which
 * sat at #183 of 411. Bucketing by literalness and keeping Fuse's order within
 * a bucket lifts whole-word matches above merely-embedded ones.
 */
const TIER_EXACT = 0
const TIER_WHOLE_WORD = 1
const TIER_SUBSTRING = 2
const TIER_FUZZY = 3

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * Matches `query` delimited by non-alphanumerics rather than using `\b`, which
 * is ASCII-word-based and so treats every boundary inside a hanzi key as a
 * word boundary.
 */
function wholeWordPattern(query: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(query)}($|[^\\p{L}\\p{N}])`, 'u')
}

function matchTier(entry: EnrichedEntry, needle: string, wholeWord: RegExp): number {
  let sawSubstring = false
  for (const key of entry.search_keys) {
    const k = key.toLowerCase()
    if (k === needle) return TIER_EXACT
    if (k.includes(needle)) {
      sawSubstring = true
      if (wholeWord.test(k)) return TIER_WHOLE_WORD
    }
  }
  return sawSubstring ? TIER_SUBSTRING : TIER_FUZZY
}

export function search(index: Fuse<EnrichedEntry>, query: string): EnrichedEntry[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const needle = trimmed.toLowerCase()
  const wholeWord = wholeWordPattern(needle)

  return index
    .search(trimmed)
    .map((result, rank) => ({ entry: result.item, rank, tier: matchTier(result.item, needle, wholeWord) }))
    .sort((a, b) => a.tier - b.tier || a.rank - b.rank)
    .map((scored) => scored.entry)
}
