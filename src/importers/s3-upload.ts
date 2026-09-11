import { createHash } from 'node:crypto'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * The S3 write path for audio clips (issue #270), replacing
 * `uploadBytesToRelease` in lingualibre-rehost.ts as the shared upload
 * primitive `rehostClip`, `rehostLocalRecording` and `backfillCafOpus`
 * build on. Bytes land in the `teochew-dictionary-audio` bucket behind the
 * `daidb11aas52z.cloudfront.net` CloudFront distribution (ADR-0026);
 * `GITHUB_RELEASE_ASSET_URL` in packages/core/src/schema/phonology.ts admits
 * this host alongside the old GitHub Release one.
 */

export const AUDIO_BUCKET = 'teochew-dictionary-audio'
export const AUDIO_CDN_BASE = 'https://daidb11aas52z.cloudfront.net'

/** The flat key prefix every clip and CAF alternate is uploaded under — see `audioClipKey`. */
export const AUDIO_CLIP_PREFIX = 'clips/'

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

/** The extension → Content-Type map for every audio format this project stores or derives. */
const CONTENT_TYPES: Record<string, string> = {
  '.webm': 'audio/webm',
  '.wav': 'audio/wav',
  '.caf': 'audio/x-caf',
  '.opus': 'audio/opus',
}

/** The Content-Type to upload `filename` with, inferred from its extension. */
export function contentTypeForFilename(filename: string): string {
  const ext = filename.match(/\.[a-zA-Z0-9]+$/u)?.[0]?.toLowerCase()
  const type = ext && CONTENT_TYPES[ext]
  if (!type) throw new Error(`no known audio Content-Type for filename '${filename}'`)
  return type
}

/** The S3 key (and CloudFront path) for an asset filename — flat, under one prefix, no release-tag segment. */
export function audioClipKey(filename: string): string {
  return `${AUDIO_CLIP_PREFIX}${filename}`
}

let sharedClient: S3Client | undefined

/** Lazily-constructed, shared across calls that don't inject their own — avoids opening a new connection pool per upload. */
function client(): S3Client {
  return (sharedClient ??= new S3Client({}))
}

export interface ExistingObject {
  checksum?: string
}

async function defaultHeadObject(key: string): Promise<ExistingObject | undefined> {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }))
    return { checksum: res.Metadata?.checksum }
  } catch (e) {
    if ((e as { name?: string }).name === 'NotFound') return undefined
    throw e
  }
}

export interface PutObjectParams {
  key: string
  body: Buffer
  contentType: string
  checksum: string
}

async function defaultPutObject(params: PutObjectParams): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: AUDIO_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      // Recorded so a later upload to the same key can tell "already
      // mirrored, safe to skip" from "a different clip landed here" without
      // re-fetching and re-hashing the object's body.
      Metadata: { checksum: params.checksum },
    }),
  )
}

export interface UploadBytesToS3Options {
  key: string
  contentType: string
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: (key: string) => Promise<ExistingObject | undefined>
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: (params: PutObjectParams) => Promise<void>
}

export interface UploadBytesToS3Result {
  url: string
  checksum: string
}

/**
 * Uploads `bytes` to `options.key` with the headers CloudFront/browsers need
 * (Content-Type, a year-long immutable Cache-Control) and returns the public
 * CloudFront URL plus the sha256 checksum the audio manifest stores.
 *
 * Refuses to silently overwrite a different clip at the same key — unlike
 * `gh release upload --clobber`, the exact mechanism that let a
 * GitHub-stripped filename clobber a different clip's bytes with no warning
 * (the ê/e collision this project already hit once). A second upload to an
 * existing key is only ever a safe no-op (identical checksum — e.g. a
 * resumed mirror run) or a hard error demanding a different key; never a
 * silent overwrite. Callers that derive `key` from a pengim syllable plus
 * speaker (see lingualibre-rehost.ts's `slugAssetFilename`) only collide
 * here when that really is the same clip.
 */
export async function uploadBytesToS3(
  bytes: Buffer,
  options: UploadBytesToS3Options,
): Promise<UploadBytesToS3Result> {
  const { key, contentType, headObject = defaultHeadObject, putObject = defaultPutObject } = options
  const checksum = sha256(bytes)
  const url = `${AUDIO_CDN_BASE}/${key}`

  const existing = await headObject(key)
  if (existing !== undefined) {
    if (existing.checksum !== checksum) {
      throw new Error(
        `refusing to overwrite s3://${AUDIO_BUCKET}/${key} — existing object has checksum ` +
          `${existing.checksum ?? '(none recorded)'}, this upload has ${checksum}. Use a different key for a ` +
          'genuinely new clip (e.g. a different speaker).',
      )
    }
    return { url, checksum }
  }

  await putObject({ key, body: bytes, contentType, checksum })
  return { url, checksum }
}
