import { syllablesToPoj } from '@teochew/core'

import { loadPengimScheme, loadPojScheme } from './load.js'
import { parsePengim } from './syllable.js'

/**
 * Disk-backed wrapper around `@teochew/core`'s pure POJ derivation
 * (ADR-0002) — see `./syllable.ts`'s doc comment for why this wrapper exists.
 */

export { syllablesToPoj }

/**
 * Derive POJ for a whole Peng'im word.
 *
 * POJ joins the syllables of a word with hyphens, which is also how it encodes
 * word boundaries — so this is not merely cosmetic.
 */
export function toPoj(pengim: string): string {
  const scheme = loadPengimScheme()
  const poj = loadPojScheme()
  return syllablesToPoj(parsePengim(pengim, scheme), poj)
}
