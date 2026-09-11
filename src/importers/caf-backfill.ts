import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseDocument } from 'yaml'

import type { Audio, AudioClip } from '@teochew/core'
import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import {
  audioAssetPath,
  audioClipKey,
  contentTypeForFilename,
  uploadBytesToS3,
  type UploadBytesToS3Options,
} from './s3-upload.js'
import { encodeCaf, type EncodeCafOptions } from './caf-encode.js'

/**
 * Backfills `cafUrl`/`cafChecksum` (issue #228) onto every already-merged
 * `.webm` clip in one variety's audio manifest that doesn't have one yet:
 * downloads the clip, transcodes it via `encodeCaf`, uploads the result to
 * S3 (issue #270), and writes the new fields back with
 * `parseDocument`/`setIn` (ADR-0018: these are structurally-regular,
 * comment-bearing manifests, not hand-tuned entry files, so mutate-in-place
 * is the right technique here, not byte-offset splicing).
 *
 * The CAF key is derived from the source clip's own pengim key and speaker
 * (`audioAssetPath`, s3-upload.ts) — the same `<speaker>/<pengim-key>`
 * directory `lingualibre-rehost.ts`'s `slugAssetFilename` uses for the
 * source clip itself, so a CAF and its source webm always land as siblings
 * regardless of which host (GitHub Release, pre-migration; or CloudFront)
 * the source `url` currently points at. S3 has no per-"folder"
 * object-count cap the way a GitHub Release does, so unlike the
 * release-tag rollover this module used to need (issue #228/#233/#239,
 * removed in issue #270), there is nothing to allocate.
 *
 * Dry-run by default, `--write` to commit (mirrors the `backfill:*` family) —
 * and, per that same family's rule, only ever fills an absent field: a clip
 * that already has `cafUrl` is left untouched, and a clip whose `url` isn't
 * `.webm` (e.g. today's `.wav` clips) is skipped as needing no alternate.
 *
 * A dry run still fetches and transcodes every pending clip — the point is to
 * prove the pipeline against real data before committing to it — but stops
 * short of the upload and the file write, both gated on `write`.
 */

export type Bucket = 'clips' | 'wordClips'

export interface BackfillCafOpusOptions extends EncodeCafOptions {
  write?: boolean
  /** Injectable for tests — avoids a real network fetch of the source clip. */
  fetchBytes?: (url: string) => Promise<Buffer>
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: UploadBytesToS3Options['headObject']
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: UploadBytesToS3Options['putObject']
}

export interface BackfilledClip {
  bucket: Bucket
  key: string
  index: number
  cafUrl: string
}

export interface BackfillCafOpusResult {
  scanned: number
  skippedHasCaf: number
  skippedNotWebm: number
  backfilled: BackfilledClip[]
}

async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Manifest clips always carry a `speaker` in practice — every merge path
 * sets it unconditionally — but the schema itself leaves it optional (a
 * hand-edited entry could omit it). This is the fallback directory a CAF
 * for such a clip lands under, rather than failing the whole backfill.
 */
const FALLBACK_SPEAKER = 'unknown-speaker'

/** The `<speaker>/<pengim-key>.caf` path for one clip's CAF alternate — see `audioAssetPath`. */
function cafPathFor(key: string, clip: AudioClip): string {
  return audioAssetPath(key, clip.speaker ?? FALLBACK_SPEAKER, '.caf')
}

function needsCaf(clip: AudioClip): boolean {
  return clip.cafUrl === undefined && /\.webm$/iu.test(clip.url)
}

const BUCKETS: Bucket[] = ['clips', 'wordClips']

/**
 * Runs the backfill over one already-loaded variety's `Audio` table, writing
 * the result into `path` (its own YAML manifest) when `write` is set.
 */
export async function backfillCafOpus(
  path: string,
  audio: Audio,
  options: BackfillCafOpusOptions = {},
): Promise<BackfillCafOpusResult> {
  const { write = false, fetchBytes = defaultFetchBytes, headObject, putObject, ...encodeOptions } = options

  if (write && !existsSync(path)) {
    throw new Error(`cannot write — no such file: ${path}`)
  }

  const result: BackfillCafOpusResult = { scanned: 0, skippedHasCaf: 0, skippedNotWebm: 0, backfilled: [] }
  const doc = write ? parseDocument(readFileSync(path, 'utf8')) : null

  for (const bucket of BUCKETS) {
    const table = audio[bucket] ?? {}
    for (const [key, clips] of Object.entries(table)) {
      for (const [index, clip] of clips.entries()) {
        result.scanned += 1

        if (clip.cafUrl !== undefined) {
          result.skippedHasCaf += 1
          continue
        }
        if (!needsCaf(clip)) {
          result.skippedNotWebm += 1
          continue
        }

        const webmBytes = await fetchBytes(clip.url)
        const cafBytes = encodeCaf(webmBytes, encodeOptions)

        if (!write) {
          result.backfilled.push({ bucket, key, index, cafUrl: '(dry run, not uploaded)' })
          continue
        }

        const cafPath = cafPathFor(key, clip)
        const { url: cafUrl, checksum: cafChecksum } = await uploadBytesToS3(cafBytes, {
          key: audioClipKey(cafPath),
          contentType: contentTypeForFilename(cafPath),
          headObject,
          putObject,
        })

        doc!.setIn([bucket, key, index, 'cafUrl'], cafUrl)
        doc!.setIn([bucket, key, index, 'cafChecksum'], cafChecksum)
        result.backfilled.push({ bucket, key, index, cafUrl })

        // Written after every clip, not just once at the end: a run over a
        // large corpus is thousands of real uploads, and an interruption
        // partway through (network blip, one bad clip, Ctrl+C) must not lose
        // the record of everything already uploaded — `needsCaf` above makes
        // a re-run naturally resume from wherever this left off.
        writeFileSync(path, doc!.toString())
      }
    }
  }

  return result
}
