import type { Source } from '../schema/entry.js'

/**
 * Per-entry licence resolution.
 *
 * An entry's licence is derived from its `sources`, never hand-written — the
 * same "store what a human must know, derive everything else" rule the schema
 * comment states for readings. A source is either `permissive` or
 * `share-alike`; anything not classified — including the literal `unknown`
 * used for sources that are cited but never reproduced, e.g. `pengim-1960` —
 * cannot back an entry directly, only a phonology mapping's `sources:` (see
 * checkMappingSources in ../validate/index.js).
 *
 * `licence` and `attributions` answer different questions, and collapsing them
 * into one string is what caused this to need re-deriving: `licence` is what
 * *governs* redistribution of the entry — BASE_LICENCE, unless a share-alike
 * source overrides it, since a merged record is an adaptation, not a mere
 * collection, and can't keep its parts separately licensed. `attributions` is
 * whose notice must additionally be retained — every non-BASE_LICENCE source
 * cited, share-alike or not. A permissive source whose text differs from
 * BASE_LICENCE (e.g. `unihan`, Unicode-DFS-2016) never changes which licence
 * governs, but it still owes its own notice; folding it silently into
 * BASE_LICENCE would lose that.
 *
 * BASE_LICENCE is deliberately not the project's code licence (BSD-3-Clause,
 * see ../../LICENSE). A software licence's "redistributions of source code /
 * in binary form" language doesn't fit a lexicon, and only the CC family
 * addresses sui generis database rights — see ../../LICENSE-DATA-CC-BY-4.0.
 */

export const BASE_LICENCE = 'CC-BY-4.0'

type LicenceClass = 'permissive' | 'share-alike'

const LICENCE_CLASS: Record<string, LicenceClass> = {
  'CC-BY-4.0': 'permissive',
  'BSD-3-Clause': 'permissive',
  'Unicode-DFS-2016': 'permissive',
  'CC-BY-SA-4.0': 'share-alike',
}

export type LicenceResolution =
  | { ok: true; licence: string; attributions: string[] }
  | { ok: false; reason: string }

/**
 * @param sourceIds Entry or mapping `sources`, already known to resolve
 * against `sources` — callers check that separately, since an unresolved id
 * is reported as its own error.
 */
export function resolveLicence(sourceIds: string[], sources: Map<string, Source>): LicenceResolution {
  const shareAlike = new Set<string>()
  const attributions = new Set<string>()

  for (const id of sourceIds) {
    const source = sources.get(id)
    const licence = source?.licence
    const cls = licence !== undefined ? LICENCE_CLASS[licence] : undefined
    if (!cls) {
      return {
        ok: false,
        reason: `source '${id}' has licence '${licence ?? 'unresolved'}', which is not classified as ` +
          'permissive or share-alike — it cannot back an entry directly',
      }
    }
    if (cls === 'share-alike') shareAlike.add(licence!)
    if (licence !== BASE_LICENCE) attributions.add(`${source!.name} (${licence})`)
  }

  if (shareAlike.size > 1) {
    return { ok: false, reason: `sources cite incompatible share-alike licences: ${[...shareAlike].join(', ')}` }
  }

  const [only] = shareAlike
  return { ok: true, licence: only ?? BASE_LICENCE, attributions: [...attributions].sort() }
}
