import type { PengimScheme } from '@teochew/core'
import {
  PengimError,
  formatSyllable,
  parsePengim as parsePengimCore,
  parseSyllable as parseSyllableCore,
  tryParsePengim as tryParsePengimCore,
  type ParseResult,
  type Syllable,
} from '@teochew/core'

import { loadPengimScheme } from './load.js'

/**
 * Disk-backed wrapper around `@teochew/core`'s pure Peng'im syllable parsing
 * (ADR-0002): every function there takes an explicit `PengimScheme` and does
 * no I/O of its own. This file exists so callers in this project that don't
 * already have a scheme loaded can keep omitting it, exactly as before the
 * extraction — the scheme is loaded here (and memoised) from
 * `data/phonology/pengim.yaml` via `./load.js`.
 */

export { PengimError, formatSyllable }
export type { ParseResult, Syllable }

let cached: PengimScheme | null = null

function resolveScheme(scheme?: PengimScheme): PengimScheme {
  return scheme ?? (cached ??= loadPengimScheme())
}

/** Test seam: drop the memoised scheme so a reload picks up edited data files. */
export function resetSchemeCache(): void {
  cached = null
}

/**
 * Parse a single Peng'im syllable, e.g. `dio5`, `ziah8`, `ng5`.
 * @throws {PengimError} if the syllable is not well-formed.
 */
export function parseSyllable(input: string, scheme?: PengimScheme): Syllable {
  return parseSyllableCore(input, resolveScheme(scheme))
}

/** Parse a whitespace-separated Peng'im word into its syllables. */
export function parsePengim(input: string, scheme?: PengimScheme): Syllable[] {
  return parsePengimCore(input, resolveScheme(scheme))
}

/** Non-throwing variant, for bulk validation where one bad row must not abort. */
export function tryParsePengim(input: string, scheme?: PengimScheme): ParseResult {
  return tryParsePengimCore(input, resolveScheme(scheme))
}
