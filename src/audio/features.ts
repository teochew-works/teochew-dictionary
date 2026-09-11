import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupTmpDir, resolveTmpDir } from '../importers/types.js'
import { AUDIO_FEATURES_FILE } from '../paths.js'
import { decodeToWav, runResynthJob, type RunResynth, type RunTool } from './resynth-tool.js'

/**
 * Per-clip acoustic features (issue #259), extracted by tools/resynth/ and
 * cached in `.cache/audio-features.json` keyed by bare sha256 hex — the same
 * key as the clip cache, so a re-recorded syllable is simply a new entry.
 *
 * The cache is versioned as a whole: `FEATURES_VERSION` here must match
 * `resynth.FEATURES_VERSION` in the Python tool, and a cache written by an
 * older extractor is discarded outright rather than merged, since a changed
 * extractor changes what every number means. (Version 1 was a 3-point f0
 * sketch left behind by an uncommitted prototype; version 2 adds the
 * time-normalised contour synthesis needs as a target.)
 */

export const FEATURES_VERSION = 2

export interface AnalysisParams {
  frameMs: number
  f0FloorHz: number
  f0CeilHz: number
  silenceDb: number
}

/** Defaults mirror `AnalysisParams` in tools/resynth/src/resynth/features.py. */
export const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = { frameMs: 5, f0FloorHz: 60, f0CeilHz: 400, silenceDb: -30 }

export interface F0Features {
  medianHz: number | null
  startHz: number | null
  endHz: number | null
  /** 20 points, time-normalised across the voiced span, in Hz; null when nothing is voiced. */
  contour: number[] | null
}

export interface ClipFeatures {
  totalMs: number
  sampleRate: number
  /** Active region outside leading/trailing silence — the same semantics as `detectSilence`. */
  trim: { startMs: number; endMs: number }
  activeMs: number
  rmsDb: number
  peakDb: number
  /** Unvoiced onset before the first voiced frame (a voiceless initial); null when nothing is voiced. */
  onsetMs: number | null
  voicedMs: number | null
  voicedRatio: number
  f0: F0Features
}

export interface FeaturesCache {
  version: typeof FEATURES_VERSION
  params: AnalysisParams
  clips: Record<string, ClipFeatures>
}

export function emptyFeaturesCache(params: AnalysisParams = DEFAULT_ANALYSIS_PARAMS): FeaturesCache {
  return { version: FEATURES_VERSION, params, clips: {} }
}

/** Null for a missing file, and for a cache from another extractor version. */
export function loadFeaturesCache(path: string = AUDIO_FEATURES_FILE): FeaturesCache | null {
  if (!existsSync(path)) return null
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (raw.version !== FEATURES_VERSION) return null
  return raw as FeaturesCache
}

export function saveFeaturesCache(cache: FeaturesCache, path: string = AUDIO_FEATURES_FILE): void {
  writeFileSync(path, JSON.stringify(cache))
}

/** One clip to analyse: its cache key and the cached WebM to decode. */
export interface FeatureTarget {
  id: string
  webmPath: string
}

export interface ExtractFeaturesOptions {
  params?: AnalysisParams
  /** Clips per tool invocation; bounds tmp disk use and paces `onProgress`. */
  batchSize?: number
  tmpDir?: string
  /** Injectable for tests — avoids shelling out to a real `ffmpeg`. */
  runFfmpeg?: RunTool
  /** Injectable for tests — avoids shelling out to `uv`/Python. */
  runResynth?: RunResynth
  /** Called after each batch with the running count and the total. */
  onProgress?: (done: number, total: number) => void
}

export interface ExtractFeaturesResult {
  clips: Record<string, ClipFeatures>
  errors: Record<string, string>
}

interface FeaturesJob {
  version: typeof FEATURES_VERSION
  params: AnalysisParams
  clips: { id: string; wav: string }[]
}

interface FeaturesToolResult {
  version: number
  clips: Record<string, ClipFeatures>
  errors: Record<string, string>
}

const DEFAULT_BATCH_SIZE = 256

/**
 * Decodes each target to WAV and runs the tool over them in batches. A clip
 * that fails to decode is reported under `errors` and skipped, so one bad
 * download doesn't cost the run; the tool likewise reports its own per-clip
 * failures rather than aborting a batch.
 */
export function extractFeatures(targets: FeatureTarget[], options: ExtractFeaturesOptions = {}): ExtractFeaturesResult {
  const { params = DEFAULT_ANALYSIS_PARAMS, batchSize = DEFAULT_BATCH_SIZE, runFfmpeg, runResynth, onProgress } = options
  const owned = resolveTmpDir('audio-features-', options.tmpDir)
  const clips: Record<string, ClipFeatures> = {}
  const errors: Record<string, string> = {}

  try {
    for (let start = 0; start < targets.length; start += batchSize) {
      const batch = targets.slice(start, start + batchSize)
      const job: FeaturesJob = { version: FEATURES_VERSION, params, clips: [] }
      for (const { id, webmPath } of batch) {
        const wav = join(owned.tmpDir, `${id}.wav`)
        try {
          decodeToWav(webmPath, wav, runFfmpeg)
          job.clips.push({ id, wav })
        } catch (e) {
          errors[id] = `failed to decode ${webmPath}: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      if (job.clips.length > 0) {
        const result = runResynthJob<FeaturesJob, FeaturesToolResult>('features', job, owned.tmpDir, runResynth)
        if (result.version !== FEATURES_VERSION) {
          throw new Error(`tools/resynth wrote features version ${result.version}, expected ${FEATURES_VERSION}`)
        }
        Object.assign(clips, result.clips)
        Object.assign(errors, result.errors)
      }
      // ~90 KB of PCM per clip; dropped per batch so a corpus run stays at
      // one batch's worth of tmp disk rather than the whole corpus's.
      for (const { wav } of job.clips) rmSync(wav, { force: true })
      onProgress?.(Math.min(start + batchSize, targets.length), targets.length)
    }
  } finally {
    cleanupTmpDir(owned)
  }

  return { clips, errors }
}
