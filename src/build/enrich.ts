import { loadAudioIfExists, loadPengimScheme, loadPojScheme, loadVariety } from '../phonology/load.js'
import { syllablesToIpa } from '../phonology/ipa.js'
import { syllablesToPoj } from '../phonology/poj.js'
import { applySandhiToSyllables, createSandhiResolver } from '../phonology/sandhi.js'
import { parsePengim } from '../phonology/syllable.js'
import { loadSources } from '../data/load.js'
import { resolveLicenceOrThrow, withProjectAttribution } from '../data/licence.js'
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

/**
 * An audio clip resolved for a reading — either one syllable (from `clips`)
 * or the reading's whole pengim string (from `wordClips`); `key` holds
 * whichever string it was looked up by.
 */
export interface AudioReference extends Pick<AudioClip, 'url' | 'confidence'> {
  /** The `clips`/`wordClips` key this clip was resolved from, e.g. `dio5` or `bhi7 jui2`. */
  key: string
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
  /**
   * A whole-word/phrase clip for this reading's exact pengim string (e.g. a
   * Lingua Libre import), distinct from the per-syllable `audio` above —
   * see `Audio.wordClips` and data/phonology/REVIEW.md § 16. `null` when no
   * such clip exists, which is the common case: most readings only ever get
   * per-syllable coverage.
   */
  wordAudio: AudioReference | null
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
   * credited. Never empty: an entry whose sources owe nobody else's notice
   * credits the project itself instead — see withProjectAttribution.
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

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 }

/**
 * Picks the one clip a single-clip consumer (Dictionary-tab playback, CLI
 * lookup) shows for a syllable/reading that has more than one (issue #134):
 * highest `confidence` wins; ties broken by the most recent `recorded` date;
 * a clip missing `recorded` sorts as older than one that has it. If still
 * tied (e.g. both undefined), the earlier clip in the list wins — `sort` is
 * stable, so this falls out of the comparator alone.
 */
function selectPrimaryClip(clips: AudioClip[]): AudioClip {
  return [...clips].sort((a, b) => {
    const byConfidence = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
    if (byConfidence !== 0) return byConfidence
    return (b.recorded ?? '').localeCompare(a.recorded ?? '')
  })[0]!
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
  if (!audio) return syllables.map(() => null)

  return syllables.map((s) => {
    const clips = audio.clips[s.raw]
    if (!clips || clips.length === 0) return null
    const clip = selectPrimaryClip(clips)

    const resolved = resolveLicenceOrThrow(clip.sources, sources, `${audio.audio.id}/${s.raw}`)

    return {
      key: s.raw,
      url: clip.url,
      confidence: clip.confidence,
      licence: resolved.licence,
      attributions: resolved.attributions,
    }
  })
}

/**
 * Look up a reading's whole-word/phrase clip, if any, keyed by its exact
 * pengim string. Distinct from `deriveReadingAudio`: no per-syllable
 * iteration, no compositional fallback — see `Audio.wordClips` and
 * data/phonology/REVIEW.md § 16.
 */
export function deriveReadingWordAudio(
  pengim: string,
  audio: Audio | null,
  sources: Map<string, Source>,
): AudioReference | null {
  const clips = audio?.wordClips?.[pengim]
  if (!audio || !clips || clips.length === 0) return null
  const clip = selectPrimaryClip(clips)

  const resolved = resolveLicenceOrThrow(clip.sources, sources, `${audio.audio.id}/${pengim}`)

  return {
    key: pengim,
    url: clip.url,
    confidence: clip.confidence,
    licence: resolved.licence,
    attributions: resolved.attributions,
  }
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
  const sources = new Map<string, Source>(loadSources().map((s) => [s.id, s]))

  const variety = memoize(loadVariety)

  // Deliberately NOT loadVariety's inheritance chain — a recording can't be
  // borrowed from a parent variety. Missing metadata is expected pre-#36, not
  // an error, so `loadAudioIfExists` returns null rather than throwing (a
  // variety whose audio.yaml exists but fails to parse still throws, and is
  // not swallowed here).
  const audioFor = memoize(loadAudioIfExists)

  // Sandhi tables are per-variety where one exists, else the reference table.
  const sandhiFor = createSandhiResolver()

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
      wordAudio: deriveReadingWordAudio(reading.pengim, audioFor(reading.variety), sources),
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

    const resolved = resolveLicenceOrThrow(entry.sources, sources, entry.id)

    return {
      ...entry,
      readings,
      search_keys: [...keys],
      licence: resolved.licence,
      attributions: withProjectAttribution(resolved.attributions),
    }
  }

  return { enrich, enrichReading }
}
