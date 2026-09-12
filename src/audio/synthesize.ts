import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupTmpDir, resolveTmpDir } from '../importers/types.js'
import { DEFAULT_ANALYSIS_PARAMS, FEATURES_VERSION, type AnalysisParams, type ClipFeatures } from './features.js'
import { decodeToWav, runResynthJob, type RunResynth, type RunTool } from './resynth-tool.js'
import type { SynthTarget } from './targets.js'

/**
 * Drives `resynth synthesize` over a batch (issue #259): decodes each source
 * clip, hands the tool the target to render toward and the path to write,
 * and returns what it rendered plus the output's own features — measured by
 * the same extractor `audio:grade` uses, so the caller's self-check scores
 * the render against the very yardsticks the target came from.
 *
 * Offline by construction: sources come from the clip cache and output goes
 * under `.cache/`. Same batching, injection and per-clip error reporting as
 * `extractFeatures`.
 */

export interface SynthJobClip {
  /** Syllable key — also the output filename. */
  key: string
  /** Cache id (bare sha256) of the source clip. */
  id: string
  webmPath: string
  target: SynthTarget
}

export interface RenderInfo {
  referenceHz: number
  sourceTrim: { startMs: number; endMs: number }
  sourceOnsetMs: number
  sourceVoicedMs: number
  renderedOnsetMs: number
  renderedVoicedMs: number
  gainDb: number
  onsetGainDb: number
  tailGainDb: number
  activeStartMs: number
  activeEndMs: number
}

export interface RenderedClip {
  key: string
  id: string
  wavPath: string
  info: RenderInfo
  features: ClipFeatures
}

export interface SynthesizeOptions {
  params?: AnalysisParams
  batchSize?: number
  tmpDir?: string
  runFfmpeg?: RunTool
  runResynth?: RunResynth
  onProgress?: (done: number, total: number) => void
}

export interface SynthesizeResult {
  rendered: Record<string, RenderedClip>
  errors: Record<string, string>
}

interface ToolJob {
  version: typeof FEATURES_VERSION
  params: AnalysisParams
  clips: { id: string; wav: string; out: string; target: SynthTarget }[]
}

interface ToolResult {
  version: number
  clips: Record<string, { out: string; info: RenderInfo; features: ClipFeatures }>
  errors: Record<string, string>
}

const DEFAULT_BATCH_SIZE = 256

/** Renders every job into `outDir/<key>.wav`. */
export function synthesizeClips(jobs: SynthJobClip[], outDir: string, options: SynthesizeOptions = {}): SynthesizeResult {
  const { params = DEFAULT_ANALYSIS_PARAMS, batchSize = DEFAULT_BATCH_SIZE, runFfmpeg, runResynth, onProgress } = options
  const owned = resolveTmpDir('audio-synth-', options.tmpDir)
  const rendered: Record<string, RenderedClip> = {}
  const errors: Record<string, string> = {}
  mkdirSync(outDir, { recursive: true })

  try {
    for (let start = 0; start < jobs.length; start += batchSize) {
      const batch = jobs.slice(start, start + batchSize)
      const byKey = new Map(batch.map((job) => [job.key, job]))
      const tool: ToolJob = { version: FEATURES_VERSION, params, clips: [] }
      for (const job of batch) {
        const wav = join(owned.tmpDir, `${job.id}.wav`)
        try {
          decodeToWav(job.webmPath, wav, runFfmpeg)
          // Keyed by syllable, not checksum: one output per syllable is the contract.
          tool.clips.push({ id: job.key, wav, out: join(outDir, `${job.key}.wav`), target: job.target })
        } catch (e) {
          errors[job.key] = `failed to decode ${job.webmPath}: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      if (tool.clips.length > 0) {
        const result = runResynthJob<ToolJob, ToolResult>('synthesize', tool, owned.tmpDir, runResynth)
        if (result.version !== FEATURES_VERSION) {
          throw new Error(`tools/resynth wrote features version ${result.version}, expected ${FEATURES_VERSION}`)
        }
        for (const [key, clip] of Object.entries(result.clips)) {
          rendered[key] = { key, id: byKey.get(key)!.id, wavPath: clip.out, info: clip.info, features: clip.features }
        }
        Object.assign(errors, result.errors)
      }
      for (const { wav } of tool.clips) rmSync(wav, { force: true })
      onProgress?.(Math.min(start + batchSize, jobs.length), jobs.length)
    }
  } finally {
    cleanupTmpDir(owned)
  }

  return { rendered, errors }
}
