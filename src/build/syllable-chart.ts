import { readLocalRecordingStaging } from '../importers/local-recording-staging.js'
import type { LocalRecordingProposal } from '../importers/local-recording-types.js'
import { generateSyllables } from '../phonology/inventory.js'
import { rimeOf } from '../phonology/ipa.js'
import { loadPengimScheme } from '../phonology/load.js'
import { declaredRimeOrder } from '../phonology/rime-order.js'
import { parseSyllable } from '../phonology/syllable.js'
import type { PengimScheme } from '../schema/phonology.js'
import { SOUNDS_VARIETY, type Sound } from './sounds.js'

/**
 * The syllable inventory presented as an initials × rimes grid (issue #171),
 * for the Sounds tab's Chart view. Distinct from `syllable-inventory.yaml`
 * (issue #30, one row per full syllable, committed as a source file): this
 * is collapsed to one row per (initial, rime) pair — the granularity the
 * chart actually renders — and is a build-only `dist/` artifact, not a
 * committed source of truth.
 */

export interface SyllableChartInitial {
  /** Peng'im initial, or '' for the zero initial. */
  pengim: string
  example?: string
  examplePengim?: string
}

export interface SyllableChartCell {
  /** '' for the zero initial. */
  initial: string
  rime: string
  /** Ascending. Phonotactically legal today (`checkToneCoda`'s tone/coda constraint only). */
  legalTones: number[]
  /** Ascending subset of `legalTones` with at least one attested `Sound`. */
  attestedTones: number[]
  /** Ascending subset of `attestedTones` with at least one recorded clip. */
  recordedTones: number[]
  /**
   * Ascending subset of `attestedTones` with a staged (unreviewed)
   * local-recording proposal. Not netted against `recordedTones` — a tone can
   * have both a published clip and a separate pending proposal (e.g. a second
   * speaker).
   */
  stagedTones: number[]
}

export interface SyllableChartCoverage {
  cellsAttested: number
  cellsWithRecording: number
  syllablesAttested: number
  syllablesRecorded: number
  /** Cells with at least one tone staged but not yet recorded. */
  cellsWithStaging: number
  /** Sum of such tones across all cells, net of `recordedTones`. */
  syllablesStaged: number
}

export interface SyllableChart {
  list: 'syllable-chart'
  /** 18 entries, zero initial first. */
  initials: SyllableChartInitial[]
  /**
   * Every rime attested somewhere in the lexicon (any initial, any tone),
   * in declared phonological order — see `declaredRimeOrder`. Deliberately
   * NOT every rime `generateSyllables()`'s full combinatorial closure can
   * produce: that closure over-generates ~3.4x as many rime shapes (332 vs.
   * 97), the large majority structurally-dubious combinations (e.g. a
   * nasalised vowel plus a stop coda) that are never attested for *any*
   * initial — padding the chart with them would bury the real, meaningful
   * gaps the feature exists to surface. This matches the density figures
   * issue #155/#171 were scoped against (18 × 97 = 1,746 legal cells, 962
   * attested).
   */
  rimes: string[]
  /** One per (initial, rime) pair with at least one legal tone. */
  cells: SyllableChartCell[]
  coverage: SyllableChartCoverage
}

function cellKey(initial: string, rime: string): string {
  return `${initial} ${rime}`
}

function addTone(map: Map<string, Set<number>>, key: string, tone: number): void {
  let set = map.get(key)
  if (!set) {
    set = new Set()
    map.set(key, set)
  }
  set.add(tone)
}

function sortedTones(set: Set<number> | undefined): number[] {
  return set ? [...set].sort((a, b) => a - b) : []
}

/**
 * Assembles `dist/syllable-chart.json`'s content. `sounds` is `buildSounds()`'s
 * output, reused rather than re-derived. `staged` defaults to reading
 * `data/staging/teochew-dictionary-audio.yaml` — the dev-only record control's
 * (issue #128) unreviewed proposals — for the staged coverage tier (issue #183).
 */
export function buildSyllableChart(
  sounds: Sound[],
  scheme: PengimScheme = loadPengimScheme(),
  staged: { proposals: LocalRecordingProposal[] } | null = readLocalRecordingStaging(),
): SyllableChart {
  const legal = generateSyllables(scheme)

  const legalByKey = new Map<string, Set<number>>()
  for (const s of legal) addTone(legalByKey, cellKey(s.initial ?? '', rimeOf(s)), s.tone)

  // See `SyllableChart.rimes`'s doc comment: the row axis is every rime
  // attested somewhere in the lexicon, not `generateSyllables()`'s full
  // (over-generating) combinatorial closure.
  const attestedRimes = new Set(sounds.map((s) => s.rime))
  const legalRimes = new Set(legal.map((s) => rimeOf(s)))
  for (const rime of attestedRimes) {
    if (!legalRimes.has(rime)) {
      throw new Error(
        `buildSyllableChart: attested rime '${rime}' does not appear in generateSyllables()'s legal syllable set`,
      )
    }
  }
  const rimes = declaredRimeOrder(
    legal.filter((s) => attestedRimes.has(rimeOf(s))),
    scheme,
  )
  const initials: SyllableChartInitial[] = [
    { pengim: '' },
    ...scheme.initials.map((i) => ({ pengim: i.pengim, example: i.example, examplePengim: i.example_pengim })),
  ]

  const attestedByKey = new Map<string, Set<number>>()
  const recordedByKey = new Map<string, Set<number>>()
  for (const sound of sounds) {
    const key = cellKey(sound.initial ?? '', sound.rime)
    addTone(attestedByKey, key, sound.tone)
    if (sound.clips.length > 0) addTone(recordedByKey, key, sound.tone)
  }

  const stagedByKey = new Map<string, Set<number>>()
  for (const proposal of staged?.proposals ?? []) {
    if (proposal.variety !== SOUNDS_VARIETY) continue
    const parsed = parseSyllable(proposal.pengim, scheme)
    addTone(stagedByKey, cellKey(parsed.initial ?? '', rimeOf(parsed)), parsed.tone)
  }

  const cells: SyllableChartCell[] = []
  const coverage: SyllableChartCoverage = {
    cellsAttested: 0,
    cellsWithRecording: 0,
    syllablesAttested: 0,
    syllablesRecorded: 0,
    cellsWithStaging: 0,
    syllablesStaged: 0,
  }

  for (const { pengim: initial } of initials) {
    for (const rime of rimes) {
      const key = cellKey(initial, rime)
      const legalSet = legalByKey.get(key)
      if (!legalSet || legalSet.size === 0) continue // no data source for "not legal" today (issue #171, out of scope)

      const attestedTones = sortedTones(attestedByKey.get(key))
      const recordedTones = sortedTones(recordedByKey.get(key))
      const stagedTones = sortedTones(stagedByKey.get(key)).filter((t) => attestedTones.includes(t))
      if (attestedTones.length > 0) {
        coverage.cellsAttested++
        coverage.syllablesAttested += attestedTones.length
      }
      if (recordedTones.length > 0) {
        coverage.cellsWithRecording++
        coverage.syllablesRecorded += recordedTones.length
      }
      const stagedOnlyTones = stagedTones.filter((t) => !recordedTones.includes(t))
      if (stagedOnlyTones.length > 0) {
        coverage.cellsWithStaging++
        coverage.syllablesStaged += stagedOnlyTones.length
      }

      cells.push({ initial, rime, legalTones: sortedTones(legalSet), attestedTones, recordedTones, stagedTones })
    }
  }

  return { list: 'syllable-chart', initials, rimes, cells, coverage }
}
