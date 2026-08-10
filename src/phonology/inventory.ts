import { loadEntries, type LoadedEntry } from '../data/load.js'
import type { PengimScheme } from '../schema/phonology.js'
import type { SyllableInventory, SyllableStatus } from '../schema/inventory.js'
import { loadExternalChart, listVarieties, loadPengimScheme } from './load.js'
import { formatSyllable, tryParsePengim, type Syllable } from './syllable.js'

/**
 * The full legal Peng'im syllable inventory (issue #30).
 *
 * Rather than re-deriving the orthography's ambiguity-resolution rules a
 * second time (longest-match initials/nuclei, medial-vs-nucleus
 * disambiguation, the nasalisation-marker-vs-coda boundary, the
 * checked-tone/checked-coda constraint), this brute-forces candidate
 * *strings* from `pengim.yaml`'s raw tables and validates each one through
 * `parseSyllable` (via `tryParsePengim`) — the same parser every other part
 * of the system already trusts. A kept syllable's fields always come from
 * the parser's own return value, never from the generator's loop variables,
 * which is what keeps this correct-by-construction even where a string is
 * reachable via more than one candidate path.
 *
 * This deliberately over-generates some structurally-parseable-but-dubious
 * forms (e.g. a nasalised vowel plus a stop coda in the same syllable) —
 * expected, and exactly the "systematic gaps" over-generation the issue
 * itself asks to flag via attestation status rather than hand-filter away.
 */

const EXTERNAL_SOURCES = ['learnteochew'] as const

/** Every syllable shape the orthography allows, sorted by canonical form. */
export function generateSyllables(scheme?: PengimScheme): Syllable[] {
  const s = scheme ?? loadPengimScheme()
  const initials: (string | null)[] = s.zero_initial
    ? [null, ...s.initials.map((i) => i.pengim)]
    : s.initials.map((i) => i.pengim)
  const medials: (string | null)[] = [null, ...s.medials]
  const codas: (string | null)[] = [null, ...s.codas]
  const tones = s.tones.map((t) => t.number)
  const marker = s.syllable.nasalisation_marker

  const candidates: string[] = []

  for (const initial of initials) {
    for (const medial of medials) {
      for (const nucleus of s.nuclei) {
        for (const nasalised of [false, true]) {
          for (const coda of codas) {
            for (const tone of tones) {
              candidates.push(
                `${initial ?? ''}${medial ?? ''}${nucleus}${nasalised ? marker : ''}${coda ?? ''}${tone}`,
              )
            }
          }
        }
      }
    }
  }

  for (const initial of initials) {
    for (const nucleus of s.syllable.syllabic_nuclei) {
      for (const tone of tones) {
        candidates.push(`${initial ?? ''}${nucleus}${tone}`)
      }
    }
  }

  const kept = new Map<string, Syllable>()
  for (const candidate of candidates) {
    const result = tryParsePengim(candidate, s)
    if (!result.ok || result.syllables.length !== 1) continue
    const syllable = result.syllables[0]!
    kept.set(syllable.raw, syllable)
  }

  return [...kept.values()].sort((a, b) => a.raw.localeCompare(b.raw))
}

/**
 * The final/rime portion of a syllable — everything after the initial, before
 * the tone digit. Matches the granularity of a published "Finals" chart, the
 * only granularity at which an external reference chart is cross-checkable
 * (no published chart enumerates full initial+final+tone syllables).
 */
export function rimeOf(syllable: Syllable): string {
  const rendered = formatSyllable(syllable)
  const withoutTone = rendered.slice(0, -1)
  return withoutTone.slice(syllable.initial?.length ?? 0)
}

/** syllable.raw → variety id → attesting entry ids. */
export function buildAttestationIndex(
  entries: LoadedEntry[] = loadEntries(),
): Map<string, Map<string, Set<string>>> {
  const index = new Map<string, Map<string, Set<string>>>()

  for (const { entry } of entries) {
    for (const reading of entry.readings) {
      const parsed = tryParsePengim(reading.pengim)
      if (!parsed.ok) continue // validate() reports malformed readings precisely; not this function's job

      for (const syllable of parsed.syllables) {
        let byVariety = index.get(syllable.raw)
        if (!byVariety) {
          byVariety = new Map()
          index.set(syllable.raw, byVariety)
        }
        let ids = byVariety.get(reading.variety)
        if (!ids) {
          ids = new Set()
          byVariety.set(reading.variety, ids)
        }
        ids.add(entry.id)
      }
    }
  }

  return index
}

/** Assembles the full `syllable-inventory.yaml` content. */
export function buildSyllableInventory(): SyllableInventory {
  const syllables = generateSyllables()
  const varieties = listVarieties()
  const attestation = buildAttestationIndex()
  const externalFinals = new Set(loadExternalChart('learnteochew').finals)

  const items = syllables.map((syllable) => {
    const byVariety = attestation.get(syllable.raw)
    const varietyStatus: Record<string, { status: SyllableStatus; attested_entries?: string[] }> = {}
    for (const v of varieties) {
      const ids = byVariety?.get(v)
      varietyStatus[v] =
        ids && ids.size > 0
          ? { status: 'attested', attested_entries: [...ids].sort() }
          : { status: 'unattested' }
    }

    return {
      syllable: syllable.raw,
      external: { learnteochew: externalFinals.has(rimeOf(syllable)) },
      varieties: varietyStatus,
    }
  })

  return {
    list: 'syllable-inventory' as const,
    varieties,
    external_sources: [...EXTERNAL_SOURCES],
    items,
  }
}
