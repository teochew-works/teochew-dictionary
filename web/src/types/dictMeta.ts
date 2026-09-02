import type { EnrichedEntry } from '@teochew/core'

/**
 * The `{ meta, entries }` envelope `dist/dict.json` is actually shaped as —
 * built by the root project's `src/build/index.ts`, which stays there (it's
 * a filesystem-writing build step, not something a mobile app bundles). Not
 * part of `@teochew/core`: unlike `EnrichedEntry` (also produced by the root
 * build, but declared in the package — see `enrichedEntry.ts` there), this
 * envelope shape is specific to how `dist/dict.json` is packaged for fetch,
 * not a type either app's own logic needs to import.
 *
 * This used to be hand-mirrored alongside `EnrichedEntry`/`EnrichedReading`/
 * `AudioReference` in this file (then `dict.ts`) — those three now come from
 * `@teochew/core` instead (ADR-0002), which is what retires the "keep this in
 * sync by hand" risk that file's doc comment used to warn about. Only this
 * envelope shape, which has no home in the shared package, stays here.
 */

export interface DictMetaVariety {
  id: string
  name: string
  inherits?: string
}

export interface DictMeta {
  generated_from: string
  entry_count: number
  reading_count: number
  varieties: DictMetaVariety[]
  sources: unknown[]
}

export interface Dict {
  meta: DictMeta
  entries: EnrichedEntry[]
}
