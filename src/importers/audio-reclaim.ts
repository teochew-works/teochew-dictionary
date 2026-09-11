import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

import type { Audio } from '@teochew/core'
import { AUDIO_BUCKET, AUDIO_BUCKET_REGION, AUDIO_CDN_BASE, AUDIO_CLIP_PREFIX } from './s3-upload.js'

/**
 * Finds and (behind `--write`) deletes S3 objects under the bucket's
 * `clips/` prefix that no variety's audio manifest references any more —
 * superseded re-recordings, or a leftover from an aborted upload (issue
 * #241/#270).
 *
 * Driven by `src/cli/audio-reclaim.ts`; kept separate from that thin CLI
 * script (a bare top-level script body, like every other file under
 * src/cli/) so this logic stays importable and unit-testable.
 */

export interface BucketObject {
  key: string
  url: string
}

export interface StrandedObject {
  key: string
  url: string
}

export interface ReclaimOptions {
  write?: boolean
  /** Injectable for tests — avoids a real AWS call. */
  listObjects?: () => Promise<BucketObject[]>
  /** Injectable for tests — avoids a real AWS call. */
  deleteObject?: (key: string) => Promise<void>
}

export interface ReclaimResult {
  objectsScanned: number
  stranded: StrandedObject[]
  deleted: StrandedObject[]
}

/**
 * Every clip/CAF URL referenced by ANY variety's audio manifest, combined.
 * Must be built across every variety at once, not one at a time — an asset
 * stranded for one variety's manifest can be the live asset for another
 * variety, and diffing bucket objects against only one variety's references
 * would delete it out from under that other variety.
 */
export function collectReferencedUrls(audios: Audio[]): Set<string> {
  const urls = new Set<string>()
  for (const audio of audios) {
    for (const bucket of ['clips', 'wordClips'] as const) {
      for (const clips of Object.values(audio[bucket] ?? {})) {
        for (const clip of clips) {
          urls.add(clip.url)
          if (clip.cafUrl) urls.add(clip.cafUrl)
        }
      }
    }
  }
  return urls
}

let sharedClient: S3Client | undefined

/** Lazily-constructed, shared across calls that don't inject their own — avoids opening a new connection pool per call. */
function getClient(): S3Client {
  return (sharedClient ??= new S3Client({ region: AUDIO_BUCKET_REGION }))
}

async function defaultListObjects(): Promise<BucketObject[]> {
  const client = getClient()
  const out: BucketObject[] = []
  let continuationToken: string | undefined

  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: AUDIO_BUCKET, Prefix: AUDIO_CLIP_PREFIX, ContinuationToken: continuationToken }),
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) out.push({ key: obj.Key, url: `${AUDIO_CDN_BASE}/${obj.Key}` })
    }
    continuationToken = res.NextContinuationToken
  } while (continuationToken)

  return out
}

async function defaultDeleteObject(key: string): Promise<void> {
  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }))
}

/**
 * Diffs every object under the bucket's `clips/` prefix against
 * `referencedUrls` (see `collectReferencedUrls`) and, when `write`, deletes
 * the ones no manifest references any more.
 */
export async function reclaimAudioAssets(referencedUrls: Set<string>, options: ReclaimOptions = {}): Promise<ReclaimResult> {
  const { write = false, listObjects = defaultListObjects, deleteObject = defaultDeleteObject } = options

  const objects = await listObjects()
  const stranded = objects.filter((o) => !referencedUrls.has(o.url))

  const deleted: StrandedObject[] = []
  if (write) {
    for (const s of stranded) {
      await deleteObject(s.key)
      deleted.push(s)
    }
  }

  return { objectsScanned: objects.length, stranded, deleted }
}
