import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupTmpDir, resolveTmpDir } from '../importers/types.js'
import { AUDIO_MFCC_FILE } from '../paths.js'
import { decodeToWav, runResynthJob, type RunResynth, type RunTool } from './resynth-tool.js'

/**
 * Per-clip MFCC frame sequences for the syllable classifier (issue #279),
 * cached in `.cache/audio-mfcc.json` keyed by bare sha256 hex — same key as
 * the clip cache and the WORLD features cache, but versioned independently
 * of `FEATURES_VERSION`: tuning MFCC parameters shouldn't invalidate the
 * (execution-costly) WORLD feature cache, or vice versa.
 */

export const MFCC_VERSION = 1

export interface MfccParams {
  frameMs: number
  hopMs: number
  nMels: number
  nMfcc: number
  silenceDb: number
}

/** Defaults mirror `MfccParams` in tools/resynth/src/resynth/mfcc.py. */
export const DEFAULT_MFCC_PARAMS: MfccParams = { frameMs: 25, hopMs: 10, nMels: 40, nMfcc: 13, silenceDb: -30 }

export interface ClipMfcc {
  frames: number[][]
}

export interface MfccCache {
  version: typeof MFCC_VERSION
  params: MfccParams
  clips: Record<string, ClipMfcc>
}

export function emptyMfccCache(params: MfccParams = DEFAULT_MFCC_PARAMS): MfccCache {
  return { version: MFCC_VERSION, params, clips: {} }
}

/** Null for a missing file, and for a cache from another extractor version. */
export function loadMfccCache(path: string = AUDIO_MFCC_FILE): MfccCache | null {
  if (!existsSync(path)) return null
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (raw.version !== MFCC_VERSION) return null
  return raw as MfccCache
}

export function saveMfccCache(cache: MfccCache, path: string = AUDIO_MFCC_FILE): void {
  writeFileSync(path, JSON.stringify(cache))
}

/** One clip to analyse: its cache key and the audio file to decode — a cached
 * corpus `.webm`, or an arbitrary query clip pointed at by `audio:classify`. */
export interface MfccTarget {
  id: string
  webmPath: string
}

export interface ExtractMfccOptions {
  params?: MfccParams
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

export interface ExtractMfccResult {
  clips: Record<string, ClipMfcc>
  errors: Record<string, string>
}

interface MfccJob {
  version: typeof MFCC_VERSION
  params: MfccParams
  clips: { id: string; wav: string }[]
}

interface MfccToolResult {
  version: number
  clips: Record<string, number[][]>
  errors: Record<string, string>
}

const DEFAULT_BATCH_SIZE = 256

/**
 * Decodes each target to WAV and runs the tool over them in batches. A clip
 * that fails to decode is reported under `errors` and skipped, so one bad
 * download doesn't cost the run; the tool likewise reports its own per-clip
 * failures rather than aborting a batch.
 */
export function extractMfcc(targets: MfccTarget[], options: ExtractMfccOptions = {}): ExtractMfccResult {
  const { params = DEFAULT_MFCC_PARAMS, batchSize = DEFAULT_BATCH_SIZE, runFfmpeg, runResynth, onProgress } = options
  const owned = resolveTmpDir('audio-mfcc-', options.tmpDir)
  const clips: Record<string, ClipMfcc> = {}
  const errors: Record<string, string> = {}

  try {
    for (let start = 0; start < targets.length; start += batchSize) {
      const batch = targets.slice(start, start + batchSize)
      const job: MfccJob = { version: MFCC_VERSION, params, clips: [] }
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
        const result = runResynthJob<MfccJob, MfccToolResult>('mfcc', job, owned.tmpDir, runResynth)
        if (result.version !== MFCC_VERSION) {
          throw new Error(`tools/resynth wrote mfcc version ${result.version}, expected ${MFCC_VERSION}`)
        }
        for (const [id, frames] of Object.entries(result.clips)) clips[id] = { frames }
        Object.assign(errors, result.errors)
      }
      // Dropped per batch so a corpus run stays at one batch's worth of tmp
      // disk rather than the whole corpus's, same as extractFeatures.
      for (const { wav } of job.clips) rmSync(wav, { force: true })
      onProgress?.(Math.min(start + batchSize, targets.length), targets.length)
    }
  } finally {
    cleanupTmpDir(owned)
  }

  return { clips, errors }
}
