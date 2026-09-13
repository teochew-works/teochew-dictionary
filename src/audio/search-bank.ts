import type { MfccParams } from '@teochew/core'
import type { AnalysisParams } from './features.js'

/**
 * The precomputed reference bank for speak-to-search (issue #279's web
 * follow-up, extended by #280's axis classifiers): per-syllable MFCC frames
 * plus the WORLD features (`onsetMs`, `f0.contour`) the initial/rime
 * segmentation and tone axis need. Built by `npm run audio:build-search-bank`,
 * written to `data/wordlists/audio-search-bank.json`, and read back with the
 * identical shape by `web/src/search/speakToSearchBank.ts` — keep the two in
 * sync by hand, the way `SearchBank`'s `params` field already had to track
 * `MfccParams` across the root/web boundary before this file existed.
 *
 * `version` bumped from 1 (MFCC-only, #279) to 2 (adds `onsetMs`/`f0Contour`,
 * #280) — a stale bank fetched by an older web build simply has no axis
 * fields to read, so callers should treat their absence as "axis classifier
 * unavailable," not as a parse error.
 */
export const SEARCH_BANK_VERSION = 2

export interface SearchBankClip {
  mfcc: number[][]
  /** Unvoiced onset in ms before the first voiced frame; null when nothing is voiced (WORLD's `onsetMs`). */
  onsetMs: number | null
  /** 20-point time-normalised F0 contour in Hz; null when nothing is voiced. */
  f0Contour: number[] | null
}

export interface SearchBank {
  version: typeof SEARCH_BANK_VERSION
  mfccParams: MfccParams
  featuresParams: AnalysisParams
  speaker: string
  variety: string
  clips: Record<string, SearchBankClip>
}
