import { execFileSync, spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupTmpDir, resolveTmpDir } from './types.js'

/**
 * Detects leading/trailing silence in a clip via `ffmpeg silencedetect`
 * (issue #252): precomputing this offline lets client-side playback skip dead
 * air using only native `<audio>` seeking (the HTML5 Media Fragments URI,
 * `#t=start,end`) — no `fetch()`/`decodeAudioData()`, so no CORS dependency
 * on the GitHub Release assets every clip is hosted from (ADR-0026).
 *
 * Every external command is injectable (mirrors `caf-encode.ts`'s
 * `runFfmpeg`/`runFfprobe`) so tests never need to shell out for real.
 */

export type RunFfprobe = (args: string[]) => string
/** Returns the tool's stderr text — that's where `silencedetect` writes its `silence_start`/`silence_end` lines. */
export type RunFfmpegSilenceDetect = (args: string[]) => string

function defaultRunFfprobe(args: string[]): string {
  return execFileSync('ffprobe', args, { encoding: 'utf8' })
}

/**
 * Unlike `caf-encode.ts`'s `runFfmpeg` (which just executes and discards
 * output via `stdio: 'inherit'`), this needs the tool's stderr text back.
 * `execFileSync` doesn't expose stderr on a successful (zero-exit) run, so
 * this shells out with `spawnSync` instead.
 */
function defaultRunFfmpeg(args: string[]): string {
  return spawnSync('ffmpeg', args, { encoding: 'utf8' }).stderr ?? ''
}

export interface DetectSilenceOptions {
  /** Injectable for tests — avoids shelling out to a real `ffprobe`. */
  runFfprobe?: RunFfprobe
  /** Injectable for tests — avoids shelling out to a real `ffmpeg`. */
  runFfmpeg?: RunFfmpegSilenceDetect
  tmpDir?: string
  /** Tmp filename extension so ffmpeg/ffprobe pick the right demuxer. */
  extension?: string
  /** `silencedetect`'s noise floor, in dB. */
  noiseDb?: number
  /** `silencedetect`'s minimum silence duration, in seconds. */
  minSilenceS?: number
}

export interface SilenceTrim {
  /** Ms into the clip where useful audio begins, or `null` if there's no leading silence to trim. */
  trimStartMs: number | null
  /** Ms into the clip where useful audio ends, or `null` if there's no trailing silence to trim. */
  trimEndMs: number | null
}

/** A clip's own boundaries, in seconds, close enough to 0/duration to count as touching that edge. */
const EDGE_EPSILON_S = 0.01

interface SilencePeriod {
  start: number
  end: number
}

/**
 * Parses ordered `silence_start: <s>` / `silence_end: <s> | silence_duration:
 * <s>` lines out of `silencedetect`'s stderr output into paired periods.
 */
function parseSilencePeriods(output: string): SilencePeriod[] {
  const periods: SilencePeriod[] = []
  let pendingStart: number | null = null

  const lineRe = /silence_(start|end):\s*(-?[\d.]+)/gu
  for (const match of output.matchAll(lineRe)) {
    const [, kind, value] = match
    const n = Number(value)
    if (kind === 'start') {
      pendingStart = n
    } else if (pendingStart !== null) {
      periods.push({ start: pendingStart, end: n })
      pendingStart = null
    }
  }

  return periods
}

/**
 * Detects `bytes`' leading/trailing silence boundaries. Returns
 * `{trimStartMs: null, trimEndMs: null}` when there's nothing to trim,
 * including the degenerate case where the only detected silence spans the
 * entire clip (a mis-tuned threshold, or a genuinely near-silent recording) —
 * trimming to zero length would be worse than not trimming at all.
 */
export function detectSilence(bytes: Buffer, options: DetectSilenceOptions = {}): SilenceTrim {
  const {
    runFfprobe = defaultRunFfprobe,
    runFfmpeg = defaultRunFfmpeg,
    extension = '.webm',
    noiseDb = -30,
    minSilenceS = 0.05,
  } = options

  const owned = resolveTmpDir('silence-detect-', options.tmpDir)
  const { tmpDir } = owned
  const clipPath = join(tmpDir, `clip${extension}`)

  try {
    writeFileSync(clipPath, bytes)

    const durationS = Number(
      runFfprobe([
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        clipPath,
      ]).trim(),
    )

    const output = runFfmpeg([
      '-i',
      clipPath,
      '-af',
      `silencedetect=noise=${noiseDb}dB:d=${minSilenceS}`,
      '-f',
      'null',
      '-',
    ])
    const periods = parseSilencePeriods(output)
    if (periods.length === 0) return { trimStartMs: null, trimEndMs: null }

    const first = periods[0]!
    const last = periods.at(-1)!

    const spansWholeClip = first.start <= EDGE_EPSILON_S && last.end >= durationS - EDGE_EPSILON_S && periods.length === 1
    if (spansWholeClip) return { trimStartMs: null, trimEndMs: null }

    const trimStartMs = first.start <= EDGE_EPSILON_S ? Math.round(first.end * 1000) : null
    const trimEndMs =
      last.end >= durationS - EDGE_EPSILON_S ? Math.round(Math.min(last.start, durationS) * 1000) : null

    return { trimStartMs, trimEndMs }
  } finally {
    rmSync(clipPath, { force: true })
    cleanupTmpDir(owned)
  }
}
