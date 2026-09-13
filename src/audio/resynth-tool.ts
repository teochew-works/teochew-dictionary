import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { RESYNTH_TOOL_DIR } from '../paths.js'

/**
 * The seam between `src/audio/` and the Python DSP tool in tools/resynth/
 * (issue #259). Every external command is injectable, exactly as `ffmpeg`/
 * `afconvert`/`gh` are in ../importers/caf-encode.js and
 * ../importers/lingualibre-rehost.js, so root tests never need Python, `uv`
 * or `ffmpeg` installed — CI's `check` job is Node-only, and the Python
 * tool's own tests run in their own job.
 */

export type RunTool = (args: string[]) => void

function defaultRunTool(command: string): RunTool {
  return (args) => execFileSync(command, args, { stdio: ['ignore', 'inherit', 'inherit'] })
}

export interface DecodeOptions {
  /** Defaults to 48 kHz, what the corpus is recorded at. */
  sampleRate?: number
  /** An `-af` filtergraph applied before the resample — a trim, a pad. */
  filter?: string
  /** 32-bit float keeps a clip that decodes above 0 dBFS from clipping; default 16-bit. */
  float?: boolean
}

/** `ffmpeg -i clip.webm clip.wav` — mono PCM. */
export function decodeToWav(
  webmPath: string,
  wavPath: string,
  runFfmpeg: RunTool = defaultRunTool('ffmpeg'),
  options: DecodeOptions = {},
): void {
  const { sampleRate = 48_000, filter, float = false } = options
  runFfmpeg([
    '-v', 'error', '-y', '-i', webmPath,
    ...(filter === undefined ? [] : ['-af', filter]),
    '-ac', '1', '-ar', String(sampleRate), '-c:a', float ? 'pcm_f32le' : 'pcm_s16le', '-f', 'wav', wavPath,
  ])
}

/**
 * Runs one `resynth <subcommand>` batch: writes `job` to `<tmpDir>/job.json`,
 * invokes the tool, and returns the parsed result. `uv run --project` keeps
 * the tool's own pinned interpreter and lockfile in charge, so a developer
 * needs `uv` on PATH and nothing else.
 */
export type RunResynth = (subcommand: string, jobPath: string, outPath: string) => void

export function defaultRunResynth(runUv: RunTool = defaultRunTool('uv')): RunResynth {
  return (subcommand, jobPath, outPath) =>
    runUv(['run', '--quiet', '--project', RESYNTH_TOOL_DIR, 'resynth', subcommand, jobPath, '--out', outPath])
}

export function runResynthJob<Job, Result>(
  subcommand: string,
  job: Job,
  tmpDir: string,
  runResynth: RunResynth = defaultRunResynth(),
): Result {
  const jobPath = join(tmpDir, `${subcommand}-job.json`)
  const outPath = join(tmpDir, `${subcommand}-result.json`)
  writeFileSync(jobPath, JSON.stringify(job))
  runResynth(subcommand, jobPath, outPath)
  return JSON.parse(readFileSync(outPath, 'utf8')) as Result
}
