import { loadAudioIfExists, loadPengimScheme, loadPojScheme, loadSandhi, loadVariety } from '../phonology/load.js'
import { syllablesToIpa } from '../phonology/ipa.js'
import { syllablesToPoj } from '../phonology/poj.js'
import { applySandhiToSyllables } from '../phonology/sandhi.js'
import { parsePengim } from '../phonology/syllable.js'
import { loadSources } from '../data/load.js'
import { resolveLicence } from '../data/licence.js'
import type { Entry, Reading, Source } from '../schema/entry.js'
import type { Audio, AudioClip, Confidence } from '../schema/phonology.js'
import type { Syllable } from '../phonology/syllable.js'

/**
 * Build-time enrichment: turn each hand-written Peng'im reading into the full
 * set of derived forms.
 *
 * All the phonology tables are loaded once here and threaded through, rather
 * than re-read per reading — the naive version re-parses every YAML file
 * thousands of times over a full build.
 */

/** A whole-syllable audio clip resolved for one syllable of a reading. */
export interface AudioReference extends Pick<AudioClip, 'url' | 'confidence'> {
  /** Canonical Peng'im syllable this clip is for, e.g. `dio5`. */
  syllable: string
  /**
   * Derived from the clip's `sources` against data/sources.yaml — see
   * ../data/licence.ts. Mirrors EnrichedEntry.licence; see its doc comment.
   */
  licence: string
  /** Notices owed in addition to `licence`. Mirrors EnrichedEntry.attributions. */
  attributions: string[]
}

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
  /**
   * One entry per syllable, in order; `null` where no clip has been recorded
   * yet. Whole-syllable, not stitched from components — see
   * data/phonology/REVIEW.md § 11. No compositional fallback exists, unlike
   * `ipa`/`poj`: a syllable either has a recording or it doesn't.
   */
  audio: (AudioReference | null)[]
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
  /**
   * Notices owed in addition to `licence` — every cited source whose own
   * licence differs from BASE_LICENCE, e.g. Unicode-DFS-2016 via `unihan`.
   * A permissive source here does not change `licence`; it still has to be
   * credited.
   */
  attributions: string[]
}

/** Strip tone digits: `dio5 ziu1` → `dio ziu`. Users rarely type tones. */
export function stripTones(pengim: string): string {
  return pengim.replace(/[1-8]/gu, '')
}

/** Strip combining diacritics from POJ so `tio` finds `tiô`. */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
}

/**
 * Look up each syllable's whole-syllable clip, if any. Pure and independent of
 * file I/O so it's directly testable — `audio` is `null` when the variety has
 * no clip metadata at all yet (issue #36 hasn't started for it).
 */
export function deriveReadingAudio(
  syllables: Syllable[],
  audio: Audio | null,
  sources: Map<string, Source>,
): (AudioReference | null)[] {
  return syllables.map((s) => {
    const clip = audio?.clips[s.raw]
    if (!clip) return null

    // Trusted to resolve: build() refuses to run while validate() reports the
    // dataset has an unresolvable licence, same as it does for entries.
    const resolved = resolveLicence(clip.sources, sources)
    if (!resolved.ok) throw new Error(`${audio!.audio.id}/${s.raw}: ${resolved.reason}`)

    return {
      syllable: s.raw,
      url: clip.url,
      confidence: clip.confidence,
      licence: resolved.licence,
      attributions: resolved.attributions,
    }
  })
}

/** Cache a per-id loader's result, so a naive per-reading call re-reads/re-parses nothing twice. */
function memoize<T>(loader: (id: string) => T): (id: string) => T {
  const cache = new Map<string, T>()
  return (id) => {
    if (!cache.has(id)) cache.set(id, loader(id))
    return cache.get(id) as T
  }
}

export function createEnricher() {
  const scheme = loadPengimScheme()
  const poj = loadPojScheme()
  const sandhiTables = new Map<string, ReturnType<typeof loadSandhi>>()
  const sources = new Map<string, Source>(loadSources().map((s) => [s.id, s]))

  const variety = memoize(loadVariety)

  // Deliberately NOT loadVariety's inheritance chain — a recording can't be
  // borrowed from a parent variety. Missing metadata is expected pre-#36, not
  // an error, so `loadAudioIfExists` returns null rather than throwing (a
  // variety whose audio.yaml exists but fails to parse still throws, and is
  // not swallowed here).
  const audioFor = memoize(loadAudioIfExists)

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
      audio: deriveReadingAudio(syllables, audioFor(reading.variety), sources),
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

    return {
      ...entry,
      readings,
      search_keys: [...keys],
      licence: resolved.licence,
      attributions: resolved.attributions,
    }
  }

  return { enrich, enrichReading }
}
