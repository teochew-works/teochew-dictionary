import { loadEntries, type LoadedEntry } from '../data/load.js'
import type { PengimScheme } from '@teochew/core'
import type { SyllableInventory, SyllableStatus } from '../schema/inventory.js'
import { loadExternalChart, listExternalCharts, listVarieties, loadPengimScheme } from './load.js'
import { rimeOf } from './ipa.js'
import { applySandhiToSyllables, createSandhiResolver } from './sandhi.js'
import { parseSyllable, tryParsePengim, type Syllable } from './syllable.js'

export { rimeOf }

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

interface Occurrence {
  key: string
  variety: string
  entryId: string
}

/** Every citation-form syllable spoken by `entries`, one `Occurrence` per syllable slot. */
function* citationOccurrences(entries: LoadedEntry[], scheme?: PengimScheme): Generator<Occurrence> {
  for (const { entry } of entries) {
    for (const reading of entry.readings) {
      const parsed = tryParsePengim(reading.pengim, scheme)
      if (!parsed.ok) continue // validate() reports malformed readings precisely; not this function's job

      for (const syllable of parsed.syllables) {
        yield { key: syllable.raw, variety: reading.variety, entryId: entry.id }
      }
    }
  }
}

/**
 * Every tone-sandhi surface form spoken by `entries`: for every
 * multi-syllable reading, every non-final syllable's sandhi surface (per
 * `applySandhiToSyllables`, issue #34/#48), one `Occurrence` per syllable
 * slot. The final syllable of a reading never undergoes sandhi and is
 * already covered by `citationOccurrences`, so it's skipped here.
 */
function* sandhiOccurrences(entries: LoadedEntry[], scheme?: PengimScheme): Generator<Occurrence> {
  const sandhiFor = createSandhiResolver()

  for (const { entry } of entries) {
    for (const reading of entry.readings) {
      const parsed = tryParsePengim(reading.pengim, scheme)
      if (!parsed.ok) continue // validate() reports malformed readings precisely; not this function's job

      const { syllables } = applySandhiToSyllables(parsed.syllables, sandhiFor(reading.variety))
      for (const s of syllables.slice(0, -1)) {
        yield { key: s.surface, variety: reading.variety, entryId: entry.id }
      }
    }
  }
}

function toAttestationIndex(occurrences: Iterable<Occurrence>): Map<string, Map<string, Set<string>>> {
  const index = new Map<string, Map<string, Set<string>>>()
  for (const { key, variety, entryId } of occurrences) {
    let byVariety = index.get(key)
    if (!byVariety) {
      byVariety = new Map()
      index.set(key, byVariety)
    }
    let ids = byVariety.get(variety)
    if (!ids) {
      ids = new Set()
      byVariety.set(variety, ids)
    }
    ids.add(entryId)
  }
  return index
}

function toAttestationCounts(occurrences: Iterable<Occurrence>): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>()
  for (const { key, variety } of occurrences) {
    let byVariety = counts.get(key)
    if (!byVariety) {
      byVariety = new Map()
      counts.set(key, byVariety)
    }
    byVariety.set(variety, (byVariety.get(variety) ?? 0) + 1)
  }
  return counts
}

/** syllable.raw → variety id → attesting entry ids. */
export function buildAttestationIndex(
  entries: LoadedEntry[] = loadEntries(),
  scheme?: PengimScheme,
): Map<string, Map<string, Set<string>>> {
  return toAttestationIndex(citationOccurrences(entries, scheme))
}

/**
 * syllable.raw → variety id → attesting entry ids, but for *sandhi-shifted*
 * surface forms rather than citation forms: for every multi-syllable
 * reading, every non-final syllable's sandhi surface (per
 * `applySandhiToSyllables`, issue #34/#48) counts as attestation of that
 * surface syllable. The final syllable of a reading never undergoes sandhi
 * and is already covered by `buildAttestationIndex`, so it's skipped here.
 */
export function buildSandhiAttestationIndex(
  entries: LoadedEntry[] = loadEntries(),
  scheme?: PengimScheme,
): Map<string, Map<string, Set<string>>> {
  return toAttestationIndex(sandhiOccurrences(entries, scheme))
}

/**
 * syllable.raw → variety id → total occurrence count of that citation-form
 * syllable across every reading, *not* deduped by entry — unlike
 * `buildAttestationIndex`'s entry-id sets, the same syllable spoken twice in
 * one reading, or by two different entries, both add to the count (issue
 * #129 needs "how many times", not "how many distinct entries").
 */
export function buildAttestationCounts(
  entries: LoadedEntry[] = loadEntries(),
  scheme?: PengimScheme,
): Map<string, Map<string, number>> {
  return toAttestationCounts(citationOccurrences(entries, scheme))
}

/** Same as `buildAttestationCounts`, but for tone-sandhi surface forms — see `buildSandhiAttestationIndex`. */
export function buildSandhiAttestationCounts(
  entries: LoadedEntry[] = loadEntries(),
  scheme?: PengimScheme,
): Map<string, Map<string, number>> {
  return toAttestationCounts(sandhiOccurrences(entries, scheme))
}

/** Assembles the full `syllable-inventory.yaml` content. */
export function buildSyllableInventory(): SyllableInventory {
  // Loaded once and threaded through both calls below (rather than letting
  // each rely on its own default), so the ~52k-candidate generator and the
  // attestation passes share one parsed scheme and one built Tables instead
  // of each paying to build their own.
  const scheme = loadPengimScheme()
  const syllables = generateSyllables(scheme)
  const varieties = listVarieties()
  const entries = loadEntries()
  const attestation = buildAttestationIndex(entries, scheme)
  const sandhiAttestation = buildSandhiAttestationIndex(entries, scheme)

  // Sandhi-shifted forms are expected to already be legal generated
  // syllables (the sandhi tables never remap a tone across the
  // checked/unchecked coda boundary, and `generateSyllables` already
  // brute-forces every tone legal for a given coda shape) — but fold in any
  // sandhi-only raw forms defensively rather than assume that holds forever.
  // `parseSyllable` is safe here: the raw string came from `formatSyllable`
  // applied to an already-validated `Syllable`.
  const byRaw = new Map(syllables.map((s) => [s.raw, s] as const))
  for (const raw of sandhiAttestation.keys()) {
    if (!byRaw.has(raw)) byRaw.set(raw, parseSyllable(raw))
  }
  const allSyllables = [...byRaw.values()].sort((a, b) => a.raw.localeCompare(b.raw))

  // Driven by whatever charts are actually present, not a hardcoded list —
  // adding data/phonology/external/<id>.yaml is enough to fold `id` into
  // both external_sources and every item's `external` map.
  const externalSources = listExternalCharts()
  const externalFinals = new Map(externalSources.map((id) => [id, new Set(loadExternalChart(id).finals)]))

  const items = allSyllables.map((syllable) => {
    const byVariety = attestation.get(syllable.raw)
    const bySandhiVariety = sandhiAttestation.get(syllable.raw)
    const varietyStatus: Record<
      string,
      { status: SyllableStatus; attested_entries?: string[]; sandhi_attested_entries?: string[] }
    > = {}
    for (const v of varieties) {
      const ids = byVariety?.get(v)
      const sandhiIds = bySandhiVariety?.get(v)
      const attested = (ids && ids.size > 0) || (sandhiIds && sandhiIds.size > 0)
      varietyStatus[v] = {
        status: attested ? 'attested' : 'unattested',
        ...(ids && ids.size > 0 ? { attested_entries: [...ids].sort() } : {}),
        ...(sandhiIds && sandhiIds.size > 0 ? { sandhi_attested_entries: [...sandhiIds].sort() } : {}),
      }
    }

    // `rimeOf` (medial+nucleus+nasal+coda) is the granularity a published
    // Finals chart is comparable at — no external chart enumerates full
    // initial+final+tone syllables.
    const rime = rimeOf(syllable)
    const external: Record<string, boolean> = {}
    for (const id of externalSources) external[id] = externalFinals.get(id)!.has(rime)

    return {
      syllable: syllable.raw,
      external,
      varieties: varietyStatus,
    }
  })

  return {
    list: 'syllable-inventory' as const,
    varieties,
    external_sources: externalSources,
    items,
  }
}
