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

/** A target that raised — fetch (timeout, HTTP error) or upload (a genuine AWS error; a checksum-mismatch refusal from `uploadBytesToS3` lands here too). */
export interface MirrorFailure extends MirrorTarget {
  error: string
}

/** How one target was resolved — passed to `MirrorOptions.onProgress` right after it happens, not batched until the whole run finishes. */
export type MirrorOutcome =
  | { kind: 'mirrored'; asset: MirroredAsset }
  | { kind: 'mismatch'; mismatch: ChecksumMismatch }
  | { kind: 'failed'; failure: MirrorFailure }

export interface MirrorProgress {
  /** Targets resolved so far, including this one — 1-based, so `scanned === total` on the last call. */
  scanned: number
  /** Fixed for the whole run — `mirrorTargets(audio).length`, computed once up front. */
  total: number
}

export interface MirrorOptions {
  write?: boolean
  /** Forwarded to every `uploadBytesToS3` call — see its own doc comment. Off by default; only for a knowing, targeted resync, typically paired with restricting `audio` to specific keys first (see `filterToKeys`). */
  overwrite?: boolean
  /** Injectable for tests — avoids a real network fetch. */
  fetchBytes?: (url: string) => Promise<Buffer>
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: UploadBytesToS3Options['headObject']
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: UploadBytesToS3Options['putObject']
  /**
   * Called synchronously right after each target resolves, so a caller (the
   * CLI) can report live progress instead of waiting for the whole corpus to
   * finish — `mirrorAudioToS3`'s own result is otherwise silent until every
   * target is done, and a full run over the real corpus takes long enough
   * (an hour or more) that "is this actually progressing?" is a real
   * question, not a hypothetical one (issue #270).
   */
  onProgress?: (progress: MirrorProgress, outcome: MirrorOutcome) => void
}

export interface MirrorResult {
  scanned: number
  mirrored: MirroredAsset[]
  mismatches: ChecksumMismatch[]
  failed: MirrorFailure[]
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

/**
 * Restricts `audio` to just the given pengim keys, across both `clips` and
 * `wordClips` — for re-syncing a known-bad subset (e.g. every key a key-
 * derivation bug's fix affects) without re-scanning and re-verifying the
 * whole corpus, most of which was already correctly mirrored. A key absent
 * from `audio` is silently a no-op rather than an error — the caller may be
 * passing a combined key list gathered across every variety's manifest,
 * and not every key exists in every variety.
 */
export function filterToKeys(audio: Audio, keys: ReadonlySet<string>): Audio {
  const pick = (table: Record<string, Audio['clips'][string]> | undefined) => {
    const out: Record<string, Audio['clips'][string]> = {}
    for (const [pengimKey, clips] of Object.entries(table ?? {})) {
      if (keys.has(pengimKey)) out[pengimKey] = clips
    }
    return out
  }
  return { ...audio, clips: pick(audio.clips), wordClips: pick(audio.wordClips) }
}

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
 *
 * A target that raises — a timeout, an HTTP error, a genuine AWS failure —
 * is recorded in `failed` and the run moves on to the next target, the same
 * way a checksum mismatch is recorded rather than treated as fatal.
 * Confirmed necessary against the real corpus (issue #270): a single
 * `HTTP 500` on one CAF asset, uncaught, discarded every target already
 * scanned before it and reported "0 scanned" for the whole variety — one
 * transient error must not cost re-verifying thousands of already-good
 * targets on the next run.
 */
export async function mirrorAudioToS3(audio: Audio, options: MirrorOptions = {}): Promise<MirrorResult> {
  const { write = false, overwrite = false, fetchBytes = defaultFetchBytes, headObject, putObject, onProgress } = options

  const targets = mirrorTargets(audio)
  const total = targets.length
  const result: MirrorResult = { scanned: 0, mirrored: [], mismatches: [], failed: [] }

  for (const target of targets) {
    result.scanned += 1
    const progress: MirrorProgress = { scanned: result.scanned, total }

    try {
      const bytes = await fetchBytes(target.sourceUrl)
      const actualChecksum = sha256(bytes)
      if (actualChecksum !== target.expectedChecksum) {
        const mismatch: ChecksumMismatch = { ...target, actualChecksum }
        result.mismatches.push(mismatch)
        onProgress?.(progress, { kind: 'mismatch', mismatch })
        continue
      }

      const path = audioAssetPathForClip(target.pengimKey, speakerFor(audio, target), extensionOf(target.sourceUrl))
      const key = audioClipKey(path)

      if (!write) {
        const asset: MirroredAsset = { ...target, s3Url: `${AUDIO_CDN_BASE}/${key}` }
        result.mirrored.push(asset)
        onProgress?.(progress, { kind: 'mirrored', asset })
        continue
      }

      const { url } = await uploadBytesToS3(bytes, {
        key,
        contentType: contentTypeForFilename(path),
        overwrite,
        headObject,
        putObject,
      })
      const asset: MirroredAsset = { ...target, s3Url: url }
      result.mirrored.push(asset)
      onProgress?.(progress, { kind: 'mirrored', asset })
    } catch (e) {
      const failure: MirrorFailure = { ...target, error: e instanceof Error ? e.message : String(e) }
      result.failed.push(failure)
      onProgress?.(progress, { kind: 'failed', failure })
    }
  }

  return result
}
