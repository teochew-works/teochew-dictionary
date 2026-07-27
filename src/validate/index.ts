import { entryFileSchema } from '../schema/entry.js'
import { readEntryFiles, loadSources } from '../data/load.js'
import {
  listVarieties,
  loadPengimScheme,
  loadPojScheme,
  loadRawVariety,
  loadSandhi,
  loadVariety,
} from '../phonology/load.js'
import { tryParsePengim } from '../phonology/syllable.js'
import { toIpa } from '../phonology/ipa.js'
import { toPoj } from '../phonology/poj.js'
import type { Entry } from '../schema/entry.js'
import type { Variety } from '../schema/phonology.js'

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

  try {
    const sandhi = loadSandhi('chaozhou')
    if (sandhi.sandhi.needs_review) {
      issues.push(
        warn(
          'data/phonology/sandhi/chaozhou.yaml',
          'sandhi table is flagged needs_review — derived sandhi tones are provisional',
        ),
      )
    }
  } catch (e) {
    issues.push(err('data/phonology/sandhi', (e as Error).message))
  }

  const sourceIds = new Set<string>()
  try {
    for (const s of loadSources()) sourceIds.add(s.id)
  } catch (e) {
    issues.push(err('data/sources.yaml', (e as Error).message))
  }

  // Must follow the sources load — the ids are what mappings are checked against.
  // Skipped entirely when sources.yaml failed to load, or every citation in the
  // phonology would be reported as unresolved on top of the real error.
  if (sourceIds.size > 0) {
    for (const id of varieties) {
      try {
        issues.push(
          ...checkMappingSources(`data/phonology/varieties/${id}.yaml`, loadRawVariety(id), sourceIds),
        )
      } catch {
        // Unreadable variety file — already reported by the phonology block above.
      }
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
      for (const s of entry.sources) {
        if (sourceIds.size > 0 && !sourceIds.has(s)) {
          issues.push(err(file, `unknown source '${s}' — add it to data/sources.yaml`, entry.id, 'sources'))
        }
      }

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
