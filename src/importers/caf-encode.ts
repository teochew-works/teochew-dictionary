import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupTmpDir, resolveTmpDir } from './types.js'

/**
 * Transcodes a WebM/Opus clip into CAF/Opus for iOS-native playback (issue
 * #228): AVFoundation has no WebM demuxer at all, but CAF has supported Opus
 * since iOS 11. Neither `ffmpeg` nor `afconvert` can do a lossless remux —
 * `afconvert` always decodes+re-encodes even Opus-to-Opus — so the source's
 * own bitrate is probed and passed through explicitly to avoid an audible
 * quality step down, rather than picking an arbitrary target bitrate.
 *
 * Every external command is injectable so tests never need to shell out for
 * real — `afconvert` in particular only exists on macOS, and CI runs
 * `ubuntu-latest`.
 */

export type RunFfprobe = (args: string[]) => string
export type RunTool = (args: string[]) => void

function defaultRunFfprobe(args: string[]): string {
  return execFileSync('ffprobe', args, { encoding: 'utf8' })
}

function defaultRunTool(command: string): RunTool {
  return (args) => execFileSync(command, args, { stdio: 'inherit' })
}

/** Used only if `ffprobe` reports no bitrate at all, at either stream or format level. */
const FALLBACK_BITRATE_BPS = 96_000

/**
 * The source clip's own bitrate in bits/second, read via `ffprobe` — first
 * the audio stream's own reported bitrate, falling back to the container's
 * overall bitrate for a file whose stream doesn't report one, and finally a
 * conservative default if neither is available, so a probe gap degrades
 * quality slightly rather than throwing.
 */
export function probeBitrateBps(path: string, runFfprobe: RunFfprobe = defaultRunFfprobe): number {
  const streamBitrate = runFfprobe([
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=bit_rate',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]).trim()
  if (streamBitrate && streamBitrate !== 'N/A') return Number(streamBitrate)

  const formatBitrate = runFfprobe([
    '-v',
    'error',
    '-show_entries',
    'format=bit_rate',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]).trim()
  if (formatBitrate && formatBitrate !== 'N/A') return Number(formatBitrate)

  return FALLBACK_BITRATE_BPS
}

export interface EncodeCafOptions {
  /** Injectable for tests — avoids shelling out to a real `ffmpeg`. */
  runFfmpeg?: RunTool
  /** Injectable for tests — avoids shelling out to a real `ffprobe`. */
  runFfprobe?: RunFfprobe
  /** Injectable for tests — avoids shelling out to a real `afconvert`. */
  runAfconvert?: RunTool
  tmpDir?: string
}

/**
 * `ffmpeg -i clip.webm clip.wav` then `afconvert -f caff -d opus -b <bps>
 * clip.wav clip.caf` — the validated pipeline from issue #228. `afconvert`
 * has no WebM reader of its own, hence the intermediate `.wav` hop through
 * `ffmpeg`.
 */
export function encodeCaf(webmBytes: Buffer, options: EncodeCafOptions = {}): Buffer {
  const {
    runFfmpeg = defaultRunTool('ffmpeg'),
    runFfprobe = defaultRunFfprobe,
    runAfconvert = defaultRunTool('afconvert'),
  } = options

  const owned = resolveTmpDir('caf-encode-', options.tmpDir)
  const { tmpDir } = owned

  const webmPath = join(tmpDir, 'clip.webm')
  const wavPath = join(tmpDir, 'clip.wav')
  const cafPath = join(tmpDir, 'clip.caf')

  try {
    writeFileSync(webmPath, webmBytes)
    runFfmpeg(['-y', '-i', webmPath, wavPath])
    const bitrateBps = probeBitrateBps(webmPath, runFfprobe)
    runAfconvert(['-f', 'caff', '-d', 'opus', '-b', String(bitrateBps), wavPath, cafPath])
    return readFileSync(cafPath)
  } finally {
    rmSync(webmPath, { force: true })
    rmSync(wavPath, { force: true })
    rmSync(cafPath, { force: true })
    // Without this a full-corpus backfill leaves one empty directory per clip
    // behind — thousands of them, never swept until the OS gets round to it.
    cleanupTmpDir(owned)
  }
}
