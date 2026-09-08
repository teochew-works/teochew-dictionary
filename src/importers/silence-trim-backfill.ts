import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseDocument } from 'yaml'

import type { Audio, AudioClip } from '@teochew/core'
import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import { detectSilence, type DetectSilenceOptions } from './silence-detect.js'

/**
 * Backfills `trimStartMs`/`trimEndMs` (issue #252) onto every clip in one
 * variety's audio manifest that's missing either one: downloads the clip,
 * runs it through `detectSilence`, and writes the new fields back with
 * `parseDocument`/`setIn` (ADR-0018: these are structurally-regular,
 * comment-bearing manifests, not hand-tuned entry files, so mutate-in-place
 * is the right technique here, not byte-offset splicing).
 *
 * Dry-run by default, `--write` to commit (mirrors the `backfill:*` family) —
 * and, per that same family's rule, only ever fills an absent field: a clip
 * that already has *both* fields is skipped entirely, and a clip with only
 * one already set (e.g. hand-overridden) keeps that value and only fills the
 * other.
 *
 * A dry run still fetches and analyzes every pending clip — the point is to
 * prove the pipeline against real data before committing to it — but stops
 * short of the file write.
 */

export type Bucket = 'clips' | 'wordClips'

export interface BackfillSilenceTrimOptions extends DetectSilenceOptions {
  write?: boolean
  /** Injectable for tests — avoids a real network fetch of the source clip. */
  fetchBytes?: (url: string) => Promise<Buffer>
}

export interface BackfilledTrim {
  bucket: Bucket
  key: string
  index: number
  trimStartMs: number | null
  trimEndMs: number | null
}

export interface BackfillSilenceTrimResult {
  scanned: number
  skippedHasTrim: number
  backfilled: BackfilledTrim[]
}

async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function needsTrim(clip: AudioClip): boolean {
  return clip.trimStartMs === undefined || clip.trimEndMs === undefined
}

const BUCKETS: Bucket[] = ['clips', 'wordClips']

/** The clip's file extension (with leading dot), for `detectSilence` to give its tmp file — defaults to `.webm` if the url has none. */
function extensionOf(url: string): string {
  const match = /\.[a-z0-9]+$/iu.exec(url)
  return match ? match[0] : '.webm'
}

/**
 * Runs the backfill over one already-loaded variety's `Audio` table, writing
 * the result into `path` (its own YAML manifest) when `write` is set.
 */
export async function backfillSilenceTrim(
  path: string,
  audio: Audio,
  options: BackfillSilenceTrimOptions = {},
): Promise<BackfillSilenceTrimResult> {
  const { write = false, fetchBytes = defaultFetchBytes, ...detectOptions } = options

  if (write && !existsSync(path)) {
    throw new Error(`cannot write — no such file: ${path}`)
  }

  const result: BackfillSilenceTrimResult = { scanned: 0, skippedHasTrim: 0, backfilled: [] }
  const doc = write ? parseDocument(readFileSync(path, 'utf8')) : null

  for (const bucket of BUCKETS) {
    const table = audio[bucket] ?? {}
    for (const [key, clips] of Object.entries(table)) {
      for (const [index, clip] of clips.entries()) {
        result.scanned += 1

        if (!needsTrim(clip)) {
          result.skippedHasTrim += 1
          continue
        }

        const bytes = await fetchBytes(clip.url)
        const { trimStartMs, trimEndMs } = detectSilence(bytes, { ...detectOptions, extension: extensionOf(clip.url) })

        if (!write) {
          result.backfilled.push({ bucket, key, index, trimStartMs, trimEndMs })
          continue
        }

        if (clip.trimStartMs === undefined && trimStartMs !== null) {
          doc!.setIn([bucket, key, index, 'trimStartMs'], trimStartMs)
        }
        if (clip.trimEndMs === undefined && trimEndMs !== null) {
          doc!.setIn([bucket, key, index, 'trimEndMs'], trimEndMs)
        }
        result.backfilled.push({ bucket, key, index, trimStartMs, trimEndMs })

        // Written after every clip, not just once at the end: a run over a
        // large corpus is thousands of fetches, and an interruption partway
        // through (network blip, one bad clip, Ctrl+C) must not lose the
        // record of everything already analyzed — `needsTrim` above makes a
        // re-run naturally resume from wherever this left off.
        writeFileSync(path, doc!.toString())
      }
    }
  }

  return result
}
