import { applySandhiToSyllables, type SandhiResult, type SandhiTable } from '@teochew/core'

import { loadSandhi } from './load.js'
import { parsePengim } from './syllable.js'

/**
 * Disk-backed wrapper around `@teochew/core`'s pure tone-sandhi derivation
 * (ADR-0002) — see `./syllable.ts`'s doc comment for why this wrapper exists.
 */

export { applySandhiToSyllables }
export type { SandhiResult }

/** Apply tone sandhi across a Peng'im word, treating it as one tone group. */
export function applySandhi(pengim: string, sandhiId = 'chaozhou'): SandhiResult {
  const table = loadSandhi(sandhiId)
  return applySandhiToSyllables(parsePengim(pengim), table)
}

/**
 * A per-variety sandhi table lookup with fallback to the `chaozhou`
 * reference table for varieties that don't have their own, cached so a
 * variety's table (or its fallback) is only loaded once per resolver.
 */
export function createSandhiResolver(): (varietyId: string) => SandhiTable {
  const cache = new Map<string, SandhiTable>()
  return (varietyId: string) => {
    let t = cache.get(varietyId)
    if (t) return t
    try {
      t = loadSandhi(varietyId)
    } catch {
      t = cache.get('chaozhou') ?? loadSandhi('chaozhou')
    }
    cache.set(varietyId, t)
    return t
  }
}
