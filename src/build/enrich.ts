import { loadAudioIfExists, loadPengimScheme, loadPojScheme, loadVariety } from '../phonology/load.js'
import { syllablesToIpa } from '../phonology/ipa.js'
import { syllablesToPoj } from '../phonology/poj.js'
import { applySandhiToSyllables, createSandhiResolver } from '../phonology/sandhi.js'
import { parsePengim } from '../phonology/syllable.js'
import { loadSources } from '../data/load.js'
import { resolveLicenceOrThrow, withProjectAttribution } from '../data/licence.js'
import { stripDiacritics, stripTones } from '@teochew/core'
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

/** Builds the published AudioReference from an already-chosen clip. */
function toAudioReference(key: string, clip: AudioClip, audio: Audio, sources: Map<string, Source>): AudioReference {
  const resolved = resolveLicenceOrThrow(clip.sources, sources, `${audio.audio.id}/${key}`)

  return {
    key,
    url: clip.url,
    cafUrl: clip.cafUrl,
    confidence: clip.confidence,
    speaker: clip.speaker,
    trimStartMs: clip.trimStartMs,
    trimEndMs: clip.trimEndMs,
    licence: resolved.licence,
    attributions: resolved.attributions,
  }
}

/**
 * The speaker every candidate set in `perSyllableClips` would need in common
 * to fully cover the reading, if one exists — `null` when any syllable has
 * no clips at all (full coverage is then impossible regardless of speaker)
 * or when no single speaker recorded a clip at every syllable. Clips with no
 * `speaker` are never counted toward any candidate — there's no identity to
 * match, same convention as `checkDuplicateSpeakers` in ../validate/index.ts.
 */
function bestCommonSpeaker(perSyllableClips: AudioClip[][]): string | null {
  if (perSyllableClips.length === 0 || perSyllableClips.some((clips) => clips.length === 0)) return null

  let candidates: Set<string> | null = null
  for (const clips of perSyllableClips) {
    const here = new Set(clips.filter((c) => c.speaker).map((c) => c.speaker!))
    if (candidates === null) {
      candidates = here
    } else {
      const intersection = new Set<string>()
      for (const s of candidates) if (here.has(s)) intersection.add(s)
      candidates = intersection
    }
    if (candidates.size === 0) return null
  }
  if (candidates === null || candidates.size === 0) return null
  if (candidates.size === 1) return [...candidates][0]!
  return pickBestCandidate([...candidates], perSyllableClips)
}

/**
 * Breaks a tie between two or more speakers who each fully cover the
 * reading: the set whose weakest clip has the highest confidence wins first
 * (a uniformly "high" take beats one dragged down by a single "low" link);
 * ties within that broken by the most recent `recorded` date anywhere in the
 * set, then by speaker id for determinism.
 */
function pickBestCandidate(speakers: string[], perSyllableClips: AudioClip[][]): string {
  function clipsFor(speaker: string): AudioClip[] {
    return perSyllableClips.map((clips) => clips.find((c) => c.speaker === speaker)!)
  }
  function worstRank(clips: AudioClip[]): number {
    return Math.max(...clips.map((c) => CONFIDENCE_RANK[c.confidence]))
  }
  function latestRecorded(clips: AudioClip[]): string {
    return clips.reduce((max, c) => ((c.recorded ?? '') > max ? (c.recorded ?? '') : max), '')
  }

  return [...speakers].sort((a, b) => {
    const clipsA = clipsFor(a)
    const clipsB = clipsFor(b)
    const byWorstConfidence = worstRank(clipsA) - worstRank(clipsB)
    if (byWorstConfidence !== 0) return byWorstConfidence
    const byRecency = latestRecorded(clipsB).localeCompare(latestRecorded(clipsA))
    if (byRecency !== 0) return byRecency
    return a.localeCompare(b)
  })[0]!
}

/**
 * Picks one clip per syllable for a whole reading at once: prefers a clip
 * set where every syllable's chosen clip shares one speaker over each
 * syllable's independently highest-confidence clip (issue #191) — the
 * per-syllable-independent rule below can otherwise silently produce a
 * mixed-speaker set even when a fully consistent take exists, which blocks
 * combined-audio synthesis for no good reason. Falls back to `selectPrimaryClip`
 * per syllable when no single speaker covers every syllable that has any
 * clip at all — including when a syllable has zero clips, which makes full
 * coverage impossible regardless of speaker.
 */
function selectReadingClips(perSyllableClips: AudioClip[][]): (AudioClip | null)[] {
  const speaker = bestCommonSpeaker(perSyllableClips)
  if (speaker !== null) {
    return perSyllableClips.map((clips) => clips.find((c) => c.speaker === speaker) ?? null)
  }
  return perSyllableClips.map((clips) => (clips.length > 0 ? selectPrimaryClip(clips) : null))
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
  const keys = syllables.map((s) => s.raw)
  const picks = selectReadingClips(keys.map((k) => audio.clips[k] ?? []))
  return keys.map((key, i) => (picks[i] ? toAudioReference(key, picks[i]!, audio, sources) : null))
}

/**
 * Same as `deriveReadingAudio`, but looks up each syllable's sandhi surface
 * spelling instead of its citation spelling, falling back to the
 * already-derived citation clip at that index when no sandhi-specific clip
 * has been recorded yet (issue #36 coverage is partial).
 *
 * The same-speaker search only considers sandhi-specific clips, not a hybrid
 * with citation-fallback positions — a syllable that falls back to
 * `citationAudio[i]` isn't reconciled against a sibling's sandhi-specific
 * speaker. Sandhi-specific coverage is presently partial enough that this
 * branch rarely has a chance to matter; worth revisiting if that changes.
 */
export function deriveReadingSandhiAudio(
  sandhi: SandhiResult,
  citationAudio: (AudioReference | null)[],
  audio: Audio | null,
  sources: Map<string, Source>,
): (AudioReference | null)[] {
  if (!audio) return citationAudio
  const keys = sandhi.syllables.map((s) => s.surface)
  const picks = selectReadingClips(keys.map((k) => audio.clips[k] ?? []))
  return keys.map((key, i) => (picks[i] ? toAudioReference(key, picks[i]!, audio, sources) : (citationAudio[i] ?? null)))
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
    cafUrl: clip.cafUrl,
    confidence: clip.confidence,
    speaker: clip.speaker,
    trimStartMs: clip.trimStartMs,
    trimEndMs: clip.trimEndMs,
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
