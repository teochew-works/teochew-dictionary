import { loadAudioIfExists, loadPengimScheme, loadPojScheme, loadVariety } from '../phonology/load.js'
import { syllablesToIpa } from '../phonology/ipa.js'
import { syllablesToPoj } from '../phonology/poj.js'
import { applySandhiToSyllables, createSandhiResolver } from '../phonology/sandhi.js'
import { parsePengim } from '../phonology/syllable.js'
import { loadSources } from '../data/load.js'
import { resolveLicenceOrThrow, withProjectAttribution } from '../data/licence.js'
import type { Entry, Reading, Source, Audio, AudioClip, Confidence, AudioReference, EnrichedReading, EnrichedEntry } from '@teochew/core'
import type { Syllable } from '../phonology/syllable.js'
import type { SandhiResult } from '../phonology/sandhi.js'

/**
 * Build-time enrichment: turn each hand-written Peng'im reading into the full
 * set of derived forms.
 *
 * All the phonology tables are loaded once here and threaded through, rather
 * than re-read per reading — the naive version re-parses every YAML file
 * thousands of times over a full build.
 *
 * `AudioReference`/`EnrichedReading`/`EnrichedEntry` are declared in
 * `@teochew/core` (see `enrichedEntry.ts` there), not here — this file does
 * the disk-dependent computation that produces them, but the shape itself is
 * what `web/` and a future `mobile/` both consume, per ADR-0002.
 */

export type { AudioReference, EnrichedReading, EnrichedEntry }

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

function resolveClipForKey(key: string, audio: Audio, sources: Map<string, Source>): AudioReference | null {
  const clips = audio.clips[key]
  if (!clips || clips.length === 0) return null
  const clip = selectPrimaryClip(clips)

  const resolved = resolveLicenceOrThrow(clip.sources, sources, `${audio.audio.id}/${key}`)

  return {
    key,
    url: clip.url,
    confidence: clip.confidence,
    licence: resolved.licence,
    attributions: resolved.attributions,
  }
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
  return syllables.map((s) => resolveClipForKey(s.raw, audio, sources))
}

/**
 * Same as `deriveReadingAudio`, but looks up each syllable's sandhi surface
 * spelling instead of its citation spelling, falling back to the
 * already-derived citation clip at that index when no sandhi-specific clip
 * has been recorded yet (issue #36 coverage is partial).
 */
export function deriveReadingSandhiAudio(
  sandhi: SandhiResult,
  citationAudio: (AudioReference | null)[],
  audio: Audio | null,
  sources: Map<string, Source>,
): (AudioReference | null)[] {
  if (!audio) return citationAudio
  return sandhi.syllables.map((s, i) => resolveClipForKey(s.surface, audio, sources) ?? citationAudio[i] ?? null)
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
    const audio = deriveReadingAudio(syllables, audioFor(reading.variety), sources)

    return {
      ...reading,
      ipa: reading.ipa ?? derived.ipa,
      poj: reading.poj ?? derivedPoj,
      sandhi: sandhi.surface,
      ipa_confidence: reading.ipa ? 'override' : derived.confidence,
      ipa_caveats: reading.ipa ? [] : derived.caveats,
      pengim_toneless: stripTones(reading.pengim),
      syllable_count: syllables.length,
      audio,
      sandhiAudio: deriveReadingSandhiAudio(sandhi, audio, audioFor(reading.variety), sources),
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
