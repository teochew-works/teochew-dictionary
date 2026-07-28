import { loadPengimScheme, loadPojScheme, loadSandhi, loadVariety } from '../phonology/load.js'
import { syllablesToIpa } from '../phonology/ipa.js'
import { syllablesToPoj } from '../phonology/poj.js'
import { applySandhiToSyllables } from '../phonology/sandhi.js'
import { parsePengim } from '../phonology/syllable.js'
import { loadSources } from '../data/load.js'
import { resolveLicence } from '../data/licence.js'
import type { Entry, Reading, Source } from '../schema/entry.js'
import type { Confidence } from '../schema/phonology.js'

/**
 * Build-time enrichment: turn each hand-written Peng'im reading into the full
 * set of derived forms.
 *
 * All the phonology tables are loaded once here and threaded through, rather
 * than re-read per reading — the naive version re-parses every YAML file
 * thousands of times over a full build.
 */

export interface EnrichedReading extends Reading {
  ipa: string
  poj: string
  /** Peng'im respelled with surface (post-sandhi) tone numbers. */
  sandhi: string
  /** Confidence of the IPA derivation, or `override` when hand-supplied. */
  ipa_confidence: Confidence | 'override'
  ipa_caveats: string[]
  /** Peng'im with tone digits stripped — the forgiving search key. */
  pengim_toneless: string
  syllable_count: number
}

export interface EnrichedEntry extends Omit<Entry, 'readings'> {
  readings: EnrichedReading[]
  /** Every string a user might reasonably type to find this entry. */
  search_keys: string[]
  /**
   * Derived from `sources` against data/sources.yaml — see ../data/licence.ts.
   * Never hand-written: BASE_LICENCE unless a cited source is share-alike, in
   * which case that source's licence covers the whole entry.
   */
  licence: string
}

/** Strip tone digits: `dio5 ziu1` → `dio ziu`. Users rarely type tones. */
export function stripTones(pengim: string): string {
  return pengim.replace(/[1-8]/gu, '')
}

/** Strip combining diacritics from POJ so `tio` finds `tiô`. */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
}

export function createEnricher() {
  const scheme = loadPengimScheme()
  const poj = loadPojScheme()
  const varieties = new Map<string, ReturnType<typeof loadVariety>>()
  const sandhiTables = new Map<string, ReturnType<typeof loadSandhi>>()
  const sources = new Map<string, Source>(loadSources().map((s) => [s.id, s]))

  const variety = (id: string) => {
    let v = varieties.get(id)
    if (!v) varieties.set(id, (v = loadVariety(id)))
    return v
  }

  // Sandhi tables are per-variety where one exists, else the reference table.
  const sandhiFor = (varietyId: string) => {
    let t = sandhiTables.get(varietyId)
    if (t) return t
    try {
      t = loadSandhi(varietyId)
    } catch {
      t = sandhiTables.get('chaozhou') ?? loadSandhi('chaozhou')
    }
    sandhiTables.set(varietyId, t)
    return t
  }

  function enrichReading(reading: Reading): EnrichedReading {
    const syllables = parsePengim(reading.pengim, scheme)
    const derived = syllablesToIpa(syllables, variety(reading.variety), scheme)
    const derivedPoj = syllablesToPoj(syllables, poj)
    const sandhi = applySandhiToSyllables(syllables, sandhiFor(reading.variety))

    return {
      ...reading,
      ipa: reading.ipa ?? derived.ipa,
      poj: reading.poj ?? derivedPoj,
      sandhi: sandhi.surface,
      ipa_confidence: reading.ipa ? 'override' : derived.confidence,
      ipa_caveats: reading.ipa ? [] : derived.caveats,
      pengim_toneless: stripTones(reading.pengim),
      syllable_count: syllables.length,
    }
  }

  function enrich(entry: Entry): EnrichedEntry {
    const readings = entry.readings.map(enrichReading)

    const keys = new Set<string>()
    keys.add(entry.headword)
    for (const v of entry.variants ?? []) keys.add(v)
    for (const r of readings) {
      keys.add(r.pengim)
      keys.add(r.pengim_toneless)
      keys.add(r.pengim_toneless.replace(/\s+/gu, ''))
      keys.add(r.poj)
      keys.add(stripDiacritics(r.poj))
      keys.add(stripDiacritics(r.poj).replace(/-/gu, ''))
    }
    for (const s of entry.senses) for (const g of s.gloss_en) keys.add(g)

    // Trusted to resolve: build() refuses to run while validate() reports the
    // dataset has an unresolvable licence, same as it does for IPA/POJ.
    const resolved = resolveLicence(entry.sources, sources)
    if (!resolved.ok) throw new Error(`${entry.id}: ${resolved.reason}`)

    return { ...entry, readings, search_keys: [...keys], licence: resolved.licence }
  }

  return { enrich, enrichReading }
}
