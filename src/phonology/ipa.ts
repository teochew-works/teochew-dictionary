import { rimeOf, syllablesToIpa, type IpaResult } from '@teochew/core'

import { loadPengimScheme, loadVariety } from './load.js'
import { parsePengim } from './syllable.js'

/**
 * Disk-backed wrapper around `@teochew/core`'s pure IPA derivation
 * (ADR-0002) — see `./syllable.ts`'s doc comment for why this wrapper exists.
 */

export { rimeOf, syllablesToIpa }
export type { IpaResult }

/** Derive IPA for a whole Peng'im word. */
export function toIpa(pengim: string, varietyId = 'chaozhou'): IpaResult {
  const scheme = loadPengimScheme()
  const variety = loadVariety(varietyId)
  return syllablesToIpa(parsePengim(pengim, scheme), variety, scheme)
}
