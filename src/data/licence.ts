import type { Source } from '../schema/entry.js'

/**
 * Licence resolution, shared by entries and audio clips alike.
 *
 * An entry's (or clip's) licence is derived from its `sources`, never
 * hand-written — the same "store what a human must know, derive everything
 * else" rule the schema comment states for readings. A source is either
 * `permissive` or `share-alike`; anything not classified cannot resolve. This
 * function only classifies the `licence` string itself — a `kind: reference`
 * source (cited for corroboration, never reproduced, e.g. `pengim-1960`) is
 * rejected earlier and never reaches here; see checkEntrySources in
 * ../validate/index.js. A `reference` source may still appear in a phonology
 * mapping's `sources:`, which checkMappingSources resolves separately.
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
  // Keyed by source id, not the formatted string, so two distinct sources
  // that happen to share a name and licence don't collapse into one notice.
  const attributions = new Map<string, string>()

  for (const id of sourceIds) {
    const source = sources.get(id)
    const licence = source?.licence
    const cls = licence !== undefined ? LICENCE_CLASS[licence] : undefined
    if (!cls) {
      return {
        ok: false,
        reason: `source '${id}' has licence '${licence ?? 'unresolved'}', which is not classified as ` +
          'permissive or share-alike',
      }
    }
    if (cls === 'share-alike') shareAlike.add(licence!)
    if (licence !== BASE_LICENCE) attributions.set(id, `${source!.name} (${licence})`)
  }

  if (shareAlike.size > 1) {
    return { ok: false, reason: `sources cite incompatible share-alike licences: ${[...shareAlike].join(', ')}` }
  }

  const [only] = shareAlike
  return { ok: true, licence: only ?? BASE_LICENCE, attributions: [...attributions.values()].sort() }
}

/**
 * `resolveLicence`, throwing with a `context`-prefixed message on failure.
 * Both call sites (entry, audio clip) are trusted to resolve — `build()`
 * refuses to run while `validate()` reports the dataset has an unresolvable
 * licence — so a throw here means that invariant was violated, not an
 * expected outcome to handle.
 */
export function resolveLicenceOrThrow(
  sourceIds: string[],
  sources: Map<string, Source>,
  context: string,
): { licence: string; attributions: string[] } {
  const resolved = resolveLicence(sourceIds, sources)
  if (!resolved.ok) throw new Error(`${context}: ${resolved.reason}`)
  return resolved
}

/**
 * Notice credited to the project itself, for an entry whose `attributions`
 * would otherwise be empty — see withProjectAttribution.
 */
export const PROJECT_ATTRIBUTION = `Teochew Works Dictionary Project (${BASE_LICENCE})`

/**
 * An empty `attributions` means every source an entry cites is BASE_LICENCE,
 * i.e. project-original work (`seed`, `teochew-dictionary-audio`) — nobody
 * else's notice is owed. Left blank, that's indistinguishable in the UI from
 * "attribution wasn't checked," so the entry credits the project instead of
 * showing nothing. Entry-only: an audio clip's credit is its own `speaker`
 * field (see data/sources.yaml), not this notice, so callers resolving a
 * clip's licence should use resolveLicence/resolveLicenceOrThrow directly.
 */
export function withProjectAttribution(attributions: string[]): string[] {
  return attributions.length > 0 ? attributions : [PROJECT_ATTRIBUTION]
}
