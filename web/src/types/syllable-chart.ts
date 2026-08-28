/**
 * Hand-written mirror of dist/syllable-chart.json's shape. Source of truth
 * lives in the root project — keep this in sync by hand with
 * `src/build/syllable-chart.ts`. See web/src/types/dict.ts's doc comment for
 * why this is a duplicated type rather than an import.
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
  /** Ascending. Phonotactically legal today (tone/coda constraint only). */
  legalTones: number[]
  /** Ascending subset of `legalTones` with at least one attested Sound. */
  attestedTones: number[]
  /** Ascending subset of `attestedTones` with at least one recorded clip. */
  recordedTones: number[]
  /** Ascending subset of `attestedTones` with a staged (unreviewed) local-recording proposal. */
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
  /** Every rime attested somewhere in the lexicon, in declared phonological order. */
  rimes: string[]
  /** One per (initial, rime) pair with at least one legal tone. */
  cells: SyllableChartCell[]
  coverage: SyllableChartCoverage
}
