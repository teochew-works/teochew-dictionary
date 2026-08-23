import type { Level } from '../schema/entry.js'

/**
 * Derives a provisional `entrySchema.level` for entries whose headword is
 * cognate with a Mandarin HSK word (issue #110, signal 1) — cross-referencing
 * against `drkameleon/complete-hsk-vocabulary`'s `complete.json`
 * (`data/sources.yaml`'s `hsk-vocabulary` id, `kind: reference`: the band is
 * consulted to derive `level`, never reproduced).
 *
 * Format (relevant fields only — see the source repo's README for the rest):
 *   [ { "simplified": "阿姨", "level": ["newest-3", "new-4", "old-3"], ... } ]
 */

export interface HskRecord {
  hanzi: string
  band: string
}

interface HskJsonRow {
  simplified?: unknown
  level?: unknown
  forms?: unknown
}

export function parseHskWordlist(text: string): HskRecord[] {
  const rows = JSON.parse(text) as unknown
  if (!Array.isArray(rows)) throw new Error('expected complete.json to be a top-level array')

  const out: HskRecord[] = []
  for (const row of rows as HskJsonRow[]) {
    const bands = Array.isArray(row.level) ? row.level.filter((b): b is string => typeof b === 'string') : []
    const hanziForms = new Set<string>()
    if (typeof row.simplified === 'string') hanziForms.add(row.simplified)
    if (Array.isArray(row.forms)) {
      for (const form of row.forms as unknown[]) {
        const traditional = (form as { traditional?: unknown } | null)?.traditional
        if (typeof traditional === 'string') hanziForms.add(traditional)
      }
    }
    for (const hanzi of hanziForms) {
      for (const band of bands) out.push({ hanzi, band })
    }
  }
  return out
}

export function buildHskIndex(records: HskRecord[]): Map<string, HskRecord[]> {
  const index = new Map<string, HskRecord[]>()
  for (const r of records) {
    const bucket = index.get(r.hanzi)
    if (bucket) bucket.push(r)
    else index.set(r.hanzi, [r])
  }
  return index
}

/**
 * HSK 2.0's `old-N` band (1–6) to CEFR, the correspondence most commonly
 * cited in Chinese-proficiency literature. Deliberately does NOT crosswalk
 * HSK 3.0's `new-N` band (1–9): China's Center for Language Education and
 * Cooperation describes only its three coarse stages (elementary 1–3,
 * intermediate 4–6, advanced 7–9) as corresponding to CEFR's A/B/C bands and
 * has published no official level-by-level table, so a `new-N`-only word
 * (no `old-N` companion band) is left unmatched by this signal rather than
 * guessed at — same "don't guess" default `matchEntryLevel` uses for an
 * outright ambiguous match. No `old-N` band reaches C2; a C2 `level` can
 * only come from issue #110's other signals or a human's hand edit.
 */
const OLD_HSK_TO_CEFR: Record<string, Level> = {
  'old-1': 'A1',
  'old-2': 'A1',
  'old-3': 'A2',
  'old-4': 'B1',
  'old-5': 'B2',
  'old-6': 'C1',
}

export function hskBandToCefr(band: string): Level | undefined {
  return OLD_HSK_TO_CEFR[band]
}

export type MatchResult = { level: Level } | { ambiguous: true } | undefined

/**
 * Exact whole-headword hanzi match only (no character-level decomposition)
 * against each of `headwords` (an entry's `headword` plus its `variants`).
 * Segmentation mismatches between a Teochew multi-character headword and
 * HSK's own word boundaries are left unmatched rather than guessed at —
 * revisit under issue #110 signal 3 (corpus-internal) if this leaves too
 * much of the lexicon untiered.
 */
export function matchEntryLevel(headwords: string[], index: Map<string, HskRecord[]>): MatchResult {
  const cefrLevels = new Set<Level>()
  for (const headword of headwords) {
    for (const record of index.get(headword) ?? []) {
      const cefr = hskBandToCefr(record.band)
      if (cefr) cefrLevels.add(cefr)
    }
  }
  if (cefrLevels.size === 0) return undefined
  if (cefrLevels.size > 1) return { ambiguous: true }
  return { level: [...cefrLevels][0]! }
}
