import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseDocument } from 'yaml'

import type { Audio, AudioClip } from '@teochew/core'
import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import { uploadBytesToRelease, type UploadBytesOptions } from './lingualibre-rehost.js'
import { encodeCaf, type EncodeCafOptions } from './caf-encode.js'

/**
 * Backfills `cafUrl`/`cafChecksum` (issue #228) onto every already-merged
 * `.webm` clip in one variety's audio manifest that doesn't have one yet:
 * downloads the clip, transcodes it via `encodeCaf`, re-hosts the result as a
 * sibling GitHub Release asset in the *same* release the source clip already
 * lives in, and writes the new fields back with `parseDocument`/`setIn`
 * (ADR-0018: these are structurally-regular, comment-bearing manifests, not
 * hand-tuned entry files, so mutate-in-place is the right technique here, not
 * byte-offset splicing).
 *
 * Dry-run by default, `--write` to commit (mirrors the `backfill:*` family) —
 * and, per that same family's rule, only ever fills an absent field: a clip
 * that already has `cafUrl` is left untouched, and a clip whose `url` isn't
 * `.webm` (e.g. today's `.wav` clips) is skipped as needing no alternate.
 *
 * A dry run still fetches and transcodes every pending clip — the point is to
 * prove the pipeline against real data before committing to it — but stops
 * short of the `gh release upload` and the file write, both gated on `write`.
 */

export type Bucket = 'clips' | 'wordClips'

export interface BackfillCafOpusOptions extends EncodeCafOptions {
  write?: boolean
  /** Injectable for tests — avoids a real network fetch of the source clip. */
  fetchBytes?: (url: string) => Promise<Buffer>
  /** Injectable for tests — avoids shelling out to a real `gh release view`. */
  releaseExists?: UploadBytesOptions['releaseExists']
  /** Injectable for tests — avoids shelling out to a real `gh`. */
  runGh?: UploadBytesOptions['runGh']
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

/** The release tag a stored clip URL was uploaded into, parsed back out of `.../releases/download/<tag>/<asset>`. */
export function tagFromClipUrl(url: string): string {
  const match = url.match(/\/releases\/download\/([^/]+)\//u)
  if (!match) throw new Error(`not a GitHub Release asset URL: ${url}`)
  return match[1]!
}

/** The `.caf` asset filename for a `.webm` clip URL, keeping its basename. */
function cafFilenameFor(url: string): string {
  return url.split('/').pop()!.replace(/\.webm$/iu, '.caf')
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
  const { write = false, fetchBytes = defaultFetchBytes, releaseExists, runGh, ...encodeOptions } = options

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

        const { url: cafUrl, checksum: cafChecksum } = await uploadBytesToRelease(cafBytes, cafFilenameFor(clip.url), {
          tag: tagFromClipUrl(clip.url),
          releaseNotes: 'CAF/Opus alternates for iOS-native playback (issue #228).',
          releaseExists,
          runGh,
        })

        doc!.setIn([bucket, key, index, 'cafUrl'], cafUrl)
        doc!.setIn([bucket, key, index, 'cafChecksum'], cafChecksum)
        result.backfilled.push({ bucket, key, index, cafUrl })
      }
    }
  }

  if (write) writeFileSync(path, doc!.toString())

  return result
}
