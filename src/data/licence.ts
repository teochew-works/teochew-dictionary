import type { Source } from '../schema/entry.js'

/**
 * Per-entry licence resolution.
 *
 * An entry's licence is derived from its `sources`, never hand-written — the
 * same "store what a human must know, derive everything else" rule the schema
 * comment states for readings. A source is either `permissive` (folds into
 * the project's own BASE_LICENCE with no extra obligation) or `share-alike`
 * (its licence propagates to the whole entry, since a merged record is an
 * adaptation, not a mere collection). Anything not classified — including the
 * literal `unknown` used for sources that are cited but never reproduced,
 * e.g. `pengim-1960` — cannot back an entry directly, only a phonology
 * mapping's `sources:` (see checkMappingSources in ../validate/index.js).
 */

export const BASE_LICENCE = 'BSD-3-Clause'

type LicenceClass = 'permissive' | 'share-alike'

const LICENCE_CLASS: Record<string, LicenceClass> = {
  'BSD-3-Clause': 'permissive',
  'Unicode-DFS-2016': 'permissive',
  'CC-BY-SA-4.0': 'share-alike',
}

export type LicenceResolution =
  | { ok: true; licence: string }
  | { ok: false; reason: string }

/**
 * @param sourceIds Entry or mapping `sources`, already known to resolve
 * against `sources` — callers check that separately, since an unresolved id
 * is reported as its own error.
 */
export function resolveLicence(sourceIds: string[], sources: Map<string, Source>): LicenceResolution {
  const shareAlike = new Set<string>()

  for (const id of sourceIds) {
    const licence = sources.get(id)?.licence
    const cls = licence !== undefined ? LICENCE_CLASS[licence] : undefined
    if (!cls) {
      return {
        ok: false,
        reason: `source '${id}' has licence '${licence ?? 'unresolved'}', which is not classified as ` +
          'permissive or share-alike — it cannot back an entry directly',
      }
    }
    if (cls === 'share-alike') shareAlike.add(licence!)
  }

  if (shareAlike.size > 1) {
    return { ok: false, reason: `sources cite incompatible share-alike licences: ${[...shareAlike].join(', ')}` }
  }

  const [only] = shareAlike
  return { ok: true, licence: only ?? BASE_LICENCE }
}
