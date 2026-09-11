import { createHash } from 'node:crypto'

import type { Audio } from '@teochew/core'
import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import {
  AUDIO_CDN_BASE,
  audioAssetPathForClip,
  audioClipKey,
  contentTypeForFilename,
  uploadBytesToS3,
  type UploadBytesToS3Options,
} from './s3-upload.js'

/**
 * Mirrors every clip and CAF alternate already on GitHub Releases into S3
 * (issue #270 step 3). Deliberately does **not** touch the manifest — that
 * is `audio-manifest-rewrite-s3.ts`, a separate and later step (issue #270
 * step 4) gated on the `packages/core` release and mobile-app pin bump
 * landing first, so the app never rejects a CloudFront URL it doesn't yet
 * recognise.
 *
 * For each (clip, field) target: fetch the bytes currently at `url`/
 * `cafUrl`, verify them against the manifest's own `checksum`/
 * `cafChecksum` — the mirror is only trustworthy if checked against the
 * same hashes the manifest already publishes (issue #270's acceptance
 * criteria) — then upload to the same key a fresh rehost of that clip would
 * use (`audioAssetPathForClip`, s3-upload.ts), so a mirrored clip and one
 * rehosted fresh afterwards are indistinguishable.
 *
 * Idempotent and resumable without any bookkeeping of its own:
 * `uploadBytesToS3` already skips a key whose existing object has a
 * matching checksum, so re-running this after an interruption just
 * re-fetches, re-verifies, and re-skips whatever the previous run already
 * mirrored.
 */

export type Bucket = 'clips' | 'wordClips'

/** One clip's bytes to mirror — either its `url` or, when present, its `cafUrl`. */
export interface MirrorTarget {
  bucket: Bucket
  pengimKey: string
  index: number
  field: 'url' | 'cafUrl'
  sourceUrl: string
  expectedChecksum: string
}

export interface MirroredAsset extends MirrorTarget {
  s3Url: string
}

export interface ChecksumMismatch extends MirrorTarget {
  actualChecksum: string
}

export interface MirrorOptions {
  write?: boolean
  /** Injectable for tests — avoids a real network fetch. */
  fetchBytes?: (url: string) => Promise<Buffer>
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: UploadBytesToS3Options['headObject']
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: UploadBytesToS3Options['putObject']
}

export interface MirrorResult {
  scanned: number
  mirrored: MirroredAsset[]
  mismatches: ChecksumMismatch[]
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

/**
 * `fetchWithRetry`'s `timeoutMs` is optional and, left unset, attaches no
 * `AbortSignal` at all — a connection that stalls (no error, no data, just
 * silence) then hangs forever instead of failing and retrying. Confirmed
 * live against the real corpus (issue #270): a mirror run sat for 38
 * minutes on the very first target with 9 seconds of CPU time spent, two
 * TCP connections still open. A clip is ~17-22 KB (ADR-0026); 30s is
 * generous for that and short enough that a real stall fails fast.
 */
const FETCH_TIMEOUT_MS = 30_000

async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } }, { timeoutMs: FETCH_TIMEOUT_MS })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

const BUCKETS: Bucket[] = ['clips', 'wordClips']

/** Every (clip, field) pair across one variety's `Audio` table that has bytes to mirror. */
export function mirrorTargets(audio: Audio): MirrorTarget[] {
  const targets: MirrorTarget[] = []

  for (const bucket of BUCKETS) {
    const table = audio[bucket] ?? {}
    for (const [pengimKey, clips] of Object.entries(table)) {
      clips.forEach((clip, index) => {
        targets.push({ bucket, pengimKey, index, field: 'url', sourceUrl: clip.url, expectedChecksum: clip.checksum })
        if (clip.cafUrl !== undefined && clip.cafChecksum !== undefined) {
          targets.push({
            bucket,
            pengimKey,
            index,
            field: 'cafUrl',
            sourceUrl: clip.cafUrl,
            expectedChecksum: clip.cafChecksum,
          })
        }
      })
    }
  }

  return targets
}

function extensionOf(url: string): string {
  return url.match(/\.[a-zA-Z0-9]+$/u)?.[0]?.toLowerCase() ?? '.wav'
}

/** The `speaker` of the one clip a target came from — looked up fresh rather than carried on the target, so `mirrorTargets` stays a plain flattening with no derived state to keep in sync. */
function speakerFor(audio: Audio, target: MirrorTarget): string | undefined {
  return audio[target.bucket]?.[target.pengimKey]?.[target.index]?.speaker
}

/**
 * Mirrors every clip/CAF target in `audio` to S3, verifying each against
 * its manifest checksum first. Never writes anything back to the manifest
 * — see the module doc comment. Dry-run by default (still fetches and
 * verifies every target, to prove the corpus is intact before committing to
 * anything, but uploads nothing); `--write` to actually mirror.
 */
export async function mirrorAudioToS3(audio: Audio, options: MirrorOptions = {}): Promise<MirrorResult> {
  const { write = false, fetchBytes = defaultFetchBytes, headObject, putObject } = options

  const result: MirrorResult = { scanned: 0, mirrored: [], mismatches: [] }

  for (const target of mirrorTargets(audio)) {
    result.scanned += 1

    const bytes = await fetchBytes(target.sourceUrl)
    const actualChecksum = sha256(bytes)
    if (actualChecksum !== target.expectedChecksum) {
      result.mismatches.push({ ...target, actualChecksum })
      continue
    }

    const path = audioAssetPathForClip(target.pengimKey, speakerFor(audio, target), extensionOf(target.sourceUrl))
    const key = audioClipKey(path)

    if (!write) {
      result.mirrored.push({ ...target, s3Url: `${AUDIO_CDN_BASE}/${key}` })
      continue
    }

    const { url } = await uploadBytesToS3(bytes, {
      key,
      contentType: contentTypeForFilename(path),
      headObject,
      putObject,
    })
    result.mirrored.push({ ...target, s3Url: url })
  }

  return result
}
