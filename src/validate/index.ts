import { entryFileSchema } from '../schema/entry.js'
import { readEntryFiles, loadSources, loadSyllableInventory } from '../data/load.js'
import {
  listExternalCharts,
  listSandhiTables,
  listVarieties,
  loadExternalChart,
  loadPengimScheme,
  loadPojScheme,
  loadRawVariety,
  loadSandhi,
  loadVariety,
} from '../phonology/load.js'
import { tryParsePengim } from '../phonology/syllable.js'
import { toIpa } from '../phonology/ipa.js'
import { toPoj } from '../phonology/poj.js'
import { resolveLicence } from '../data/licence.js'
import type { Entry, Source } from '../schema/entry.js'
import type { Variety } from '../schema/phonology.js'
import type { ExternalChart, SyllableInventory } from '../schema/inventory.js'

/**
 * Whole-dataset validation.
 *
 * Collects every problem rather than stopping at the first, because the usual
 * use is "I just added thirty entries, tell me everything wrong with them".
 *
 * Errors block the build; warnings do not. The distinction is whether the
 * dataset is *malformed* (error) or merely *unfinished / uncertain* (warning) —
 * a lexicon in progress should stay buildable.
 */

export type Level = 'error' | 'warning'

export interface Issue {
  level: Level
  file: string
  /** Entry id where known; absent for file-level problems. */
  id?: string
  /** Dotted path within the entry, e.g. `readings[0].pengim`. */
  path?: string
  message: string
}

/** Attestations per citation tone, keyed 1–8 and always fully populated. */
export type ToneCounts = Record<number, number>

export interface ValidationReport {
  issues: Issue[]
  entryCount: number
  readingCount: number
  errorCount: number
  warningCount: number
  /** Entries flagged `needs_review`, plus those with low-confidence derivations. */
  reviewCount: number
  /**
   * Syllable tokens per tone, across readings and examples.
   *
   * Exists because a tone can be silently missing from the whole lexicon: the
   * seed was originally written with tone 7 (陽去) collapsed into tone 6 (陽上),
   * and nothing caught it, because every individual entry parsed and derived
   * cleanly. A tone that never appears is the signal.
   */
  toneCounts: ToneCounts
}

/** The eight citation tones, in order. */
export const TONES = [1, 2, 3, 4, 5, 6, 7, 8] as const

function emptyToneCounts(): ToneCounts {
  return Object.fromEntries(TONES.map((t) => [t, 0]))
}

function err(file: string, message: string, id?: string, path?: string): Issue {
  return { level: 'error', file, message, ...(id && { id }), ...(path && { path }) }
}

function warn(file: string, message: string, id?: string, path?: string): Issue {
  return { level: 'warning', file, message, ...(id && { id }), ...(path && { path }) }
}

export function validate(): ValidationReport {
  const issues: Issue[] = []
  const toneCounts = emptyToneCounts()
  let entryCount = 0
  let readingCount = 0
  let reviewCount = 0

  // ── Phonology data must load before anything can be derived from it ──────────
  const varieties = new Set(listVarieties())
  try {
    loadPengimScheme()
    loadPojScheme()
    for (const v of varieties) loadVariety(v)
  } catch (e) {
    issues.push(err('data/phonology', (e as Error).message))
    return summarise(issues, 0, 0, 0, toneCounts)
  }

  for (const id of listSandhiTables()) {
    try {
      const sandhi = loadSandhi(id)
      if (sandhi.sandhi.needs_review) {
        issues.push(
          warn(
            `data/phonology/sandhi/${id}.yaml`,
            'sandhi table is flagged needs_review — derived sandhi tones are provisional',
          ),
        )
      }
    } catch (e) {
      issues.push(err(`data/phonology/sandhi/${id}.yaml`, (e as Error).message))
    }
  }

  const sourceIds = new Set<string>()
  const sourceMap = new Map<string, Source>()
  try {
    for (const s of loadSources()) {
      sourceIds.add(s.id)
      sourceMap.set(s.id, s)
    }
  } catch (e) {
    issues.push(err('data/sources.yaml', (e as Error).message))
  }

  // Must follow the sources load — the ids are what mappings are checked against.
  // Skipped entirely when sources.yaml failed to load, or every citation in the
  // phonology would be reported as unresolved on top of the real error. Every
  // variety is known to parse by this point; the block above returns early
  // otherwise, so loadRawVariety cannot fail here.
  if (sourceIds.size > 0) {
    for (const id of varieties) {
      issues.push(
        ...checkMappingSources(`data/phonology/varieties/${id}.yaml`, loadRawVariety(id), sourceIds),
      )
    }
  }

  const seenIds = new Map<string, string>()
  const seenHeadwords = new Map<string, string[]>()

  for (const { file, raw } of readEntryFiles()) {
    const parsed = entryFileSchema.safeParse(raw)
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        issues.push(err(file, i.message, undefined, i.path.join('.')))
      }
      continue
    }

    for (const entry of parsed.data.entries) {
      entryCount += 1
      if (entry.needs_review) reviewCount += 1

      // ── uniqueness ──────────────────────────────────────────────────────────
      const prior = seenIds.get(entry.id)
      if (prior) {
        issues.push(err(file, `duplicate id '${entry.id}' (also in ${prior})`, entry.id))
      } else {
        seenIds.set(entry.id, file)
      }

      // Same headword in several entries is legitimate (homographs), but worth
      // surfacing so genuine accidental duplicates get noticed.
      const hw = seenHeadwords.get(entry.headword)
      if (hw) hw.push(entry.id)
      else seenHeadwords.set(entry.headword, [entry.id])

      // ── provenance ──────────────────────────────────────────────────────────
      issues.push(...checkEntrySources(file, entry, sourceIds, sourceMap))

      readingCount += entry.readings.length
      reviewCount += checkReadings(entry, file, varieties, issues, toneCounts)
      checkExamples(entry, file, issues, toneCounts)
    }
  }

  for (const [headword, ids] of seenHeadwords) {
    if (ids.length > 1) {
      issues.push(
        warn('data/entries', `headword '${headword}' appears in ${ids.length} entries: ${ids.join(', ')}`),
      )
    }
  }

  // ── syllable inventory (issue #30) — cheap structural/referential checks ────
  // Whether the committed file is actually *up to date* with pengim.yaml and
  // data/entries/ is a stronger claim than validate() makes here — that's the
  // vitest drift-check test's job (tests/inventory.test.ts), so the same
  // invariant isn't asserted by two different mechanisms.
  if (sourceIds.size > 0) {
    for (const id of listExternalCharts()) {
      try {
        issues.push(
          ...checkExternalChart(`data/phonology/external/${id}.yaml`, loadExternalChart(id), sourceIds),
        )
      } catch (e) {
        issues.push(err(`data/phonology/external/${id}.yaml`, (e as Error).message))
      }
    }

    try {
      const entryIds = new Set(seenIds.keys())
      issues.push(
        ...checkSyllableInventory(
          'data/wordlists/syllable-inventory.yaml',
          loadSyllableInventory(),
          varieties,
          sourceIds,
          entryIds,
        ),
      )
    } catch (e) {
      issues.push(err('data/wordlists/syllable-inventory.yaml', (e as Error).message))
    }
  }

  // A tone nobody uses is almost never a real gap in the language — it means a
  // tone category was written as its neighbour throughout. Warning rather than
  // error so a lexicon in progress stays buildable.
  if (entryCount > 0) {
    const missing = TONES.filter((t) => toneCounts[t] === 0)
    if (missing.length > 0) {
      issues.push(
        warn(
          'data/entries',
          `tone${missing.length === 1 ? '' : 's'} ${missing.join(', ')} unattested across the whole lexicon — ` +
            'likely collapsed into a neighbouring tone rather than genuinely absent ' +
            '(see data/phonology/REVIEW.md § 7)',
        ),
      )
    }
  }

  return summarise(issues, entryCount, readingCount, reviewCount, toneCounts)
}

/**
 * An entry's `sources:` may only cite `kind: import` ids — a `kind: reference`
 * source is evidence about the language, not the origin of an entry's content
 * (see checkMappingSources, which mapping `sources:` go through instead and
 * may cite either kind). An entry's licence is derived from its sources, not
 * written by hand; that resolution is skipped when a source id above didn't
 * even resolve, so one root cause doesn't get reported twice.
 */
export function checkEntrySources(
  file: string,
  entry: Entry,
  sourceIds: Set<string>,
  sourceMap: Map<string, Source>,
): Issue[] {
  const issues: Issue[] = []
  let sourcesResolved = true

  for (const s of entry.sources) {
    if (sourceIds.size > 0 && !sourceIds.has(s)) {
      issues.push(err(file, `unknown source '${s}' — add it to data/sources.yaml`, entry.id, 'sources'))
      sourcesResolved = false
    } else if (sourceMap.get(s)?.kind === 'reference') {
      issues.push(
        err(
          file,
          `source '${s}' is kind: reference — cannot back an entry directly (evidence about the language, not the entry's content)`,
          entry.id,
          'sources',
        ),
      )
      sourcesResolved = false
    }
  }

  if (sourcesResolved && sourceMap.size > 0) {
    const licence = resolveLicence(entry.sources, sourceMap)
    if (!licence.ok) {
      issues.push(err(file, `unresolvable licence: ${licence.reason}`, entry.id, 'sources'))
    }
  }

  return issues
}

/** The mapping groups in a variety file, all of which may cite sources. */
const MAPPING_GROUPS = ['initials', 'medials', 'nuclei', 'codas', 'irregular'] as const

/**
 * A phonology mapping may cite the descriptions its `confidence` rests on. Ids
 * are resolved the same way entry `sources` are, and an unresolved one is an
 * error rather than a warning: a citation that does not resolve is worse than no
 * citation, because it still reads as evidence.
 *
 * Takes one variety's OWN mappings — callers pass `loadRawVariety`, not the
 * flattened chain, so a bad id in chaozhou.yaml is reported once against that
 * file rather than again for every overlay that inherits it.
 */
export function checkMappingSources(
  file: string,
  variety: Variety,
  sourceIds: Set<string>,
): Issue[] {
  const issues: Issue[] = []

  for (const group of MAPPING_GROUPS) {
    for (const [key, m] of Object.entries(variety[group] ?? {})) {
      for (const s of m.sources ?? []) {
        if (!sourceIds.has(s)) {
          issues.push(
            err(file, `unknown source '${s}' — add it to data/sources.yaml`, undefined, `${group}.${key}.sources`),
          )
        }
      }
    }
  }

  return issues
}

/** A cached external reference chart's `source` must resolve, same as any other citation. */
export function checkExternalChart(file: string, chart: ExternalChart, sourceIds: Set<string>): Issue[] {
  if (sourceIds.has(chart.source)) return []
  return [err(file, `unknown source '${chart.source}' — add it to data/sources.yaml`)]
}

/**
 * Cheap structural/referential checks on the generated syllable inventory
 * (issue #30): every `varieties` key is a known variety, every `external` key
 * is a declared external source, every `attested_entries` id resolves against
 * the entries just loaded. Whether the file's *content* is still fresh is the
 * drift-check test's job, not this one's — see the comment at the call site.
 */
export function checkSyllableInventory(
  file: string,
  inventory: SyllableInventory,
  varietyIds: Set<string>,
  sourceIds: Set<string>,
  entryIds: Set<string>,
): Issue[] {
  const issues: Issue[] = []

  for (const source of inventory.external_sources) {
    if (!sourceIds.has(source)) {
      issues.push(err(file, `unknown external source '${source}' — add it to data/sources.yaml`))
    }
  }

  inventory.items.forEach(({ syllable, external, varieties }) => {
    const path = `items[${syllable}]`

    for (const key of Object.keys(external)) {
      if (!inventory.external_sources.includes(key)) {
        issues.push(err(file, `external source '${key}' not declared in \`external_sources\``, undefined, path))
      }
    }

    for (const [variety, status] of Object.entries(varieties)) {
      if (!varietyIds.has(variety)) {
        issues.push(
          err(file, `unknown variety '${variety}' (have: ${[...varietyIds].join(', ')})`, undefined, path),
        )
        continue
      }
      for (const id of status.attested_entries ?? []) {
        if (!entryIds.has(id)) {
          issues.push(
            err(file, `attested_entries references unknown entry '${id}'`, undefined, `${path}.${variety}`),
          )
        }
      }
    }
  })

  return issues
}

/** @returns how many readings carry low-confidence derivations. */
function checkReadings(
  entry: Entry,
  file: string,
  varieties: Set<string>,
  issues: Issue[],
  toneCounts: ToneCounts,
): number {
  let lowConfidence = 0

  entry.readings.forEach((reading, i) => {
    const path = `readings[${i}].pengim`

    if (!varieties.has(reading.variety)) {
      issues.push(
        err(file, `unknown variety '${reading.variety}' (have: ${[...varieties].join(', ')})`, entry.id, `readings[${i}].variety`),
      )
      return
    }

    const parsed = tryParsePengim(reading.pengim)
    if (!parsed.ok) {
      issues.push(err(file, parsed.error, entry.id, path))
      return
    }

    for (const s of parsed.syllables) toneCounts[s.tone] = (toneCounts[s.tone] ?? 0) + 1

    // Derivation must actually succeed — a Peng'im string can be well-formed
    // orthographically yet hit a gap in a variety's mapping table.
    try {
      const ipa = toIpa(reading.pengim, reading.variety)
      if (ipa.confidence === 'low') {
        lowConfidence += 1
        issues.push(
          warn(file, `IPA derivation is low-confidence: ${ipa.caveats.join(' ') || 'no note given'}`, entry.id, path),
        )
      }
    } catch (e) {
      issues.push(err(file, `IPA derivation failed: ${(e as Error).message}`, entry.id, path))
    }

    try {
      toPoj(reading.pengim)
    } catch (e) {
      issues.push(err(file, `POJ derivation failed: ${(e as Error).message}`, entry.id, path))
    }
  })

  return lowConfidence
}

function checkExamples(entry: Entry, file: string, issues: Issue[], toneCounts: ToneCounts): void {
  entry.senses.forEach((sense, si) => {
    sense.examples?.forEach((ex, ei) => {
      const path = `senses[${si}].examples[${ei}].pengim`
      const parsed = tryParsePengim(ex.pengim)
      if (!parsed.ok) {
        issues.push(err(file, parsed.error, entry.id, path))
        return
      }

      for (const s of parsed.syllables) toneCounts[s.tone] = (toneCounts[s.tone] ?? 0) + 1
      // A mismatch here usually means a syllable was dropped when transcribing.
      const hanziCount = [...ex.hanzi].filter((c) => /\p{Script=Han}/u.test(c)).length
      if (hanziCount > 0 && hanziCount !== parsed.syllables.length) {
        issues.push(
          warn(
            file,
            `example has ${hanziCount} Han characters but ${parsed.syllables.length} Peng'im syllables`,
            entry.id,
            path,
          ),
        )
      }
    })
  })
}

function summarise(
  issues: Issue[],
  entryCount: number,
  readingCount: number,
  reviewCount: number,
  toneCounts: ToneCounts,
): ValidationReport {
  return {
    issues,
    entryCount,
    readingCount,
    reviewCount,
    toneCounts,
    errorCount: issues.filter((i) => i.level === 'error').length,
    warningCount: issues.filter((i) => i.level === 'warning').length,
  }
}
