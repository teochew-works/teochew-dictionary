import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument } from 'yaml'

import type { Audio, AudioClip } from '@teochew/core'
import { checksumHex } from '../audio/clip-cache.js'
import type { ClipFeatures } from '../audio/features.js'
import type { RenderInfo } from '../audio/synthesize.js'
import type { RenderCheck } from '../audio/targets.js'
import { AUDIO_SYNTH_DIR } from '../paths.js'
import { encodeCaf, type EncodeCafOptions, type RunTool } from './caf-encode.js'
import { audioAssetPathForClip, audioClipKey, contentTypeForFilename, uploadBytesToS3, type UploadBytesToS3Options } from './s3-upload.js'
import { cleanupTmpDir, resolveTmpDir } from './types.js'

/**
 * Publishes `audio:synthesize`'s renders as a second, derived speaker tier
 * (ADR-0027, issue #259): for every syllable whose render passed its
 * self-check, encodes the WAV to WebM/Opus (and a CAF sibling, issue #228),
 * uploads both to S3 behind CloudFront (issue #270) at the same
 * `<speaker>/<pengim-key>` path a fresh rehost of any clip would use
 * (`audioAssetPathForClip`, s3-upload.ts), and appends a clip record beside
 * the recording it derives from — `speaker` `<speaker>-n`,
 * `synthesis`/`derivedFrom` set, confidence `medium`, the dedicated source
 * id, and trim bounds written directly since the render placed its own
 * pad. The recording is never touched.
 *
 * The `-n` speaker directory keeps the tier's objects segregated from the
 * recordings' own (`jky/…`) without any tag/release bookkeeping — S3 has no
 * per-"folder" object-count cap the way a GitHub Release does (issue #270
 * removed that whole allocator from `caf-backfill.ts`; this module never
 * had one to begin with).
 *
 * Same shape as `backfillCafOpus`: dry-run by default and still encodes
 * every clip to prove the pipeline, `--write` uploads and mutates the
 * manifest in place with `parseDocument` (ADR-0018 — a regular,
 * comment-bearing file, not a hand-typed entry), written after every clip
 * so an interrupted run resumes. A syllable that already has a render by
 * this speaker id is skipped unless `force`, which replaces it in place —
 * `overwrite` is forwarded to `uploadBytesToS3` only then, for the same
 * reason `backfillCafOpus`/`audio-mirror-to-s3` gate it: a legitimate
 * re-render re-encodes to different bytes at an already-occupied key, and
 * `uploadBytesToS3` refuses that overwrite unless asked.
 */

export const RESYNTH_SOURCE = 'teochew-dictionary-audio-resynth'
/** The tier's speaker id, derived from the recording's: `jky` → `jky-n`. */
export const RESYNTH_SPEAKER_SUFFIX = '-n'
/** Comparable to the recordings, which the browser recorder produced at ~128 kbps. */
export const RESYNTH_OPUS_BITRATE = '128k'

export interface ResynthReportClip {
  id: string
  wavPath: string
  info: RenderInfo
  features: ClipFeatures
  check: RenderCheck
}

/** `report.json` as `src/cli/audio-synthesize.ts` writes it. */
export interface ResynthReport {
  version: number
  generated: string
  variety: string
  clips: Record<string, ResynthReportClip>
  errors: Record<string, string>
}

export function resynthReportPath(variety: string, synthDir: string = AUDIO_SYNTH_DIR): string {
  return join(synthDir, variety, 'report.json')
}

export function readResynthReport(variety: string, synthDir: string = AUDIO_SYNTH_DIR): ResynthReport | null {
  const path = resynthReportPath(variety, synthDir)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as ResynthReport
}

export function resynthSpeakerId(recording: AudioClip): string {
  return `${recording.speaker ?? 'recording'}${RESYNTH_SPEAKER_SUFFIX}`
}

export interface MergeResynthOptions extends EncodeCafOptions {
  write?: boolean
  force?: boolean
  /** Merge only these syllable keys. */
  only?: string[]
  /** `recorded` for the new clip records; defaults to today (UTC). */
  renderDate?: string
  /** Skip the CAF sibling — `afconvert` is macOS-only. */
  skipCaf?: boolean
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: UploadBytesToS3Options['headObject']
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: UploadBytesToS3Options['putObject']
  /** Injectable for tests — reads the render's WAV bytes. */
  readWav?: (path: string) => Buffer
}

export interface MergedRender {
  key: string
  speaker: string
  url: string
  /** '(dry run, not uploaded)' when not writing. */
  cafUrl?: string
}

export interface MergeResynthResult {
  scanned: number
  skippedFailedCheck: number
  skippedAlreadyMerged: number
  merged: MergedRender[]
  errors: { key: string; message: string }[]
}

function defaultRunTool(command: string): RunTool {
  return (args) => execFileSync(command, args, { stdio: 'inherit' })
}

/** `ffmpeg -i render.wav -c:a libopus -b:a 128k render.webm`. */
export function encodeWebm(wavBytes: Buffer, options: { runFfmpeg?: RunTool; tmpDir?: string } = {}): Buffer {
  const { runFfmpeg = defaultRunTool('ffmpeg') } = options
  const owned = resolveTmpDir('webm-encode-', options.tmpDir)
  const wavPath = join(owned.tmpDir, 'render.wav')
  const webmPath = join(owned.tmpDir, 'render.webm')
  try {
    writeFileSync(wavPath, wavBytes)
    runFfmpeg(['-v', 'error', '-y', '-i', wavPath, '-c:a', 'libopus', '-b:a', RESYNTH_OPUS_BITRATE, webmPath])
    return readFileSync(webmPath)
  } finally {
    rmSync(wavPath, { force: true })
    rmSync(webmPath, { force: true })
    cleanupTmpDir(owned)
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function mergeResynth(
  path: string,
  audio: Audio,
  report: ResynthReport,
  options: MergeResynthOptions = {},
): Promise<MergeResynthResult> {
  const {
    write = false,
    force = false,
    only,
    renderDate = todayUtc(),
    skipCaf = false,
    headObject,
    putObject,
    readWav = (p) => readFileSync(p),
    ...encodeOptions
  } = options

  if (write && !existsSync(path)) throw new Error(`cannot write — no such file: ${path}`)

  const result: MergeResynthResult = { scanned: 0, skippedFailedCheck: 0, skippedAlreadyMerged: 0, merged: [], errors: [] }
  const doc = write ? parseDocument(readFileSync(path, 'utf8')) : null

  const keys = Object.keys(report.clips).filter((key) => !only || only.includes(key))
  for (const key of keys) {
    const render = report.clips[key]!
    result.scanned += 1
    if (!render.check.pass) {
      result.skippedFailedCheck += 1
      continue
    }

    const clips = audio.clips[key] ?? []
    const sourceIndex = clips.findIndex((c) => checksumHex(c.checksum) === render.id && c.synthesis === undefined)
    if (sourceIndex === -1) {
      result.errors.push({ key, message: `render derives from ${render.id.slice(0, 12)}…, which is not a recording at '${key}' — re-run audio:synthesize` })
      continue
    }
    const source = clips[sourceIndex]!
    const speaker = resynthSpeakerId(source)
    const existingIndex = clips.findIndex((c) => c.synthesis !== undefined && c.speaker === speaker)
    if (existingIndex !== -1 && !force) {
      result.skippedAlreadyMerged += 1
      continue
    }

    let webmBytes: Buffer
    let cafBytes: Buffer | null = null
    try {
      webmBytes = encodeWebm(readWav(render.wavPath), encodeOptions)
      if (!skipCaf) cafBytes = encodeCaf(webmBytes, encodeOptions)
    } catch (e) {
      result.errors.push({ key, message: `failed to encode: ${e instanceof Error ? e.message : String(e)}` })
      continue
    }

    if (!write) {
      result.merged.push({ key, speaker, url: '(dry run, not uploaded)', ...(cafBytes && { cafUrl: '(dry run, not uploaded)' }) })
      continue
    }

    // existingIndex !== -1 here means `force`: a re-render at an
    // already-occupied key, which uploadBytesToS3 otherwise refuses.
    const overwrite = existingIndex !== -1

    const webmPath = audioAssetPathForClip(key, speaker, '.webm')
    const { url, checksum } = await uploadBytesToS3(webmBytes, {
      key: audioClipKey(webmPath),
      contentType: contentTypeForFilename(webmPath),
      overwrite,
      headObject,
      putObject,
    })

    let caf: { cafUrl: string; cafChecksum: string } | undefined
    if (cafBytes) {
      const cafPath = audioAssetPathForClip(key, speaker, '.caf')
      const uploaded = await uploadBytesToS3(cafBytes, {
        key: audioClipKey(cafPath),
        contentType: contentTypeForFilename(cafPath),
        overwrite,
        headObject,
        putObject,
      })
      caf = { cafUrl: uploaded.url, cafChecksum: uploaded.checksum }
    }

    const clip: AudioClip = {
      url,
      confidence: 'medium',
      sources: [RESYNTH_SOURCE],
      speaker,
      recorded: renderDate,
      checksum,
      ...caf,
      trimStartMs: Math.round(render.info.activeStartMs),
      trimEndMs: Math.round(render.info.activeEndMs),
      synthesis: 'world-retune',
      derivedFrom: source.checksum,
    }

    if (existingIndex !== -1) doc!.setIn(['clips', key, existingIndex], clip)
    else doc!.addIn(['clips', key], clip)
    // Written after every clip, as backfillCafOpus does: thousands of real
    // uploads, and an interruption must not lose the record of the ones done.
    writeFileSync(path, doc!.toString())
    // Keep the in-memory table in step so a later key sees this one's state.
    if (existingIndex !== -1) clips[existingIndex] = clip
    else audio.clips[key] = [...clips, clip]

    result.merged.push({ key, speaker, url, ...(caf && { cafUrl: caf.cafUrl }) })
  }

  return result
}
