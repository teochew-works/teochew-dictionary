import { createHash } from 'node:crypto'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { AUDIO_CDN_HOST } from '@teochew/core'

/**
 * The S3 write path for audio clips (issue #270), replacing the old
 * `uploadBytesToRelease` in lingualibre-rehost.ts as the shared upload
 * primitive `rehostClip`, `rehostLocalRecording` and `backfillCafOpus`
 * build on. Bytes land in the `teochew-dictionary-audio` bucket behind the
 * CloudFront distribution at `AUDIO_CDN_HOST` (ADR-0026) — imported from
 * `@teochew/core` rather than restated here, so it can never drift from the
 * same host the schema's `CLOUDFRONT_AUDIO_URL` allows in
 * packages/core/src/schema/phonology.ts, alongside the old GitHub Release
 * host.
 */

export const AUDIO_BUCKET = 'teochew-dictionary-audio'
/**
 * `S3Client` resolves a region lazily through a provider chain (env vars,
 * shared config, IMDS, ...) when none is given explicitly — and on a
 * machine with no region configured anywhere in that chain, every single
 * command re-attempts (and re-fails) that whole resolution rather than
 * caching a permanent failure. Confirmed live (issue #270): a real
 * `--write` run against the actual bucket took over an hour to fail
 * "Region is missing" on all 6,176 targets, immediately fixed by passing
 * this explicitly instead of leaving it to be inferred.
 */
export const AUDIO_BUCKET_REGION = 'us-east-1'
export const AUDIO_CDN_BASE = `https://${AUDIO_CDN_HOST}`

/** The key prefix every clip and CAF alternate is uploaded under — see `audioClipKey`/`audioAssetPath`. */
export const AUDIO_CLIP_PREFIX = 'teochew/clips/'

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

/** The S3 key (and CloudFront path) for an asset path — `options.key` for `uploadBytesToS3`. */
export function audioClipKey(assetPath: string): string {
  return `${AUDIO_CLIP_PREFIX}${assetPath}`
}

/**
 * `ê` is not just an accented `e` — it's a different vowel (/e/ vs /ɯ/,
 * README § Peng'im gotchas), and a real, common minimal-pair distinction in
 * this corpus (570 of the manifest's pengim keys use it). A plain NFD strip
 * collapses it onto plain `e`, which silently merges distinct syllables
 * that only differ by the circumflex — confirmed live against the real
 * bucket (issue #270): `gêng1` and `geng1`, both real words, both spoken by
 * the same speaker, both mapped to the same S3 key. `uploadBytesToS3`'s
 * collision guard caught it (a hard error, not silent corruption) but 108
 * clips' second half still never got mirrored.
 *
 * `x` and a doubled `ee` are confirmed absent from every real pengim key in
 * this corpus (checked directly against data/phonology/audio/chaozhou.yaml),
 * so `ê`→`ex` is collision-free without inventing a punctuation character
 * the URL pattern in phonology.ts would need to admit.
 *
 * Exported so `checkAudio` (src/validate/index.ts) can check a clip's url
 * against the same transliteration its own asset path actually went
 * through, instead of a plain diacritic-strip that no longer matches what
 * this function produces for a `ê` syllable.
 */
export function transliterateCircumflexE(s: string): string {
  return s.replace(/[êÊ]/gu, 'ex')
}

/** NFD-decompose and strip remaining combining marks so a path segment stays plain ASCII — everything but `ê` (see `transliterateCircumflexE`) round-trips through this safely as a plain accent to drop. */
function slugSegment(s: string): string {
  return transliterateCircumflexE(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'gu'), '')
    .replace(/\s+/gu, '-')
}

/**
 * The `<speaker>/<pengim-key><ext>` relative path a clip and its CAF
 * alternate share, one directory per speaker — not a flat
 * `<pengim-key>-<speaker><ext>` filename. `mergeLinguaLibreClip`/
 * `mergeLocalRecording` already let a distinct speaker's clip append at an
 * already-used pengim key with no flag needed (issue #134), so the key must
 * disambiguate speakers on its own; nesting by speaker does that the same
 * way a flat hyphenated name would, but also keeps this project's own
 * "pengim is the primary key, speaker is per-clip" shape (see how
 * `data/phonology/audio/*.yaml` itself is structured) rather than
 * inverting it.
 *
 * Shared by `lingualibre-rehost.ts`'s `slugAssetFilename` (for the source
 * clip) and `caf-backfill.ts` (for its CAF alternate) so both land under the
 * same `<speaker>/<pengim-key>` directory — deriving straight from `key` and
 * `speaker` rather than parsing a source URL keeps this correct regardless
 * of which host (GitHub Release, pre-migration; or CloudFront) that source
 * clip currently lives at.
 */
export function audioAssetPath(key: string, speaker: string, ext: string): string {
  return `${slugSegment(speaker)}/${slugSegment(key)}${ext}`
}

/**
 * Manifest clips always carry a `speaker` in practice — every merge path
 * sets it unconditionally — but the schema itself leaves it optional (a
 * hand-edited entry could omit it). This is the directory such a clip's
 * asset path falls back to, rather than failing whatever derives it.
 */
export const FALLBACK_SPEAKER = 'unknown-speaker'

/** `audioAssetPath`, tolerating a clip with no recorded `speaker` — see `FALLBACK_SPEAKER`. */
export function audioAssetPathForClip(key: string, speaker: string | undefined, ext: string): string {
  return audioAssetPath(key, speaker ?? FALLBACK_SPEAKER, ext)
}

let sharedClient: S3Client | undefined

/** Lazily-constructed, shared across calls that don't inject their own — avoids opening a new connection pool per upload. */
function client(): S3Client {
  return (sharedClient ??= new S3Client({ region: AUDIO_BUCKET_REGION }))
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
  /**
   * Deliberately overwrite a different clip already at `key`, instead of
   * refusing. Off by default — only for a knowing, targeted resync (e.g.
   * `audio-mirror-to-s3 --overwrite --keys=...`) of specific keys already
   * confirmed stale, such as a leftover from a key-derivation bug fixed
   * since the original upload (issue #270: the ê→e collision left the
   * *wrong* clip's bytes sitting at some plain-e siblings' rightful key).
   * A plain S3 `PutObject` already overwrites unconditionally on its own;
   * this only ever removes this module's own added safety check, never an
   * S3-level one.
   */
  overwrite?: boolean
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
 * Refuses to silently overwrite a different clip at the same key unless
 * `overwrite` is explicitly set — unlike `gh release upload --clobber`, the
 * exact mechanism that let a GitHub-stripped filename clobber a different
 * clip's bytes with no warning (the ê/e collision this project already hit
 * once). A second upload to an existing key is a safe no-op (identical
 * checksum — e.g. a resumed mirror run), a hard error demanding a different
 * key or `overwrite` (mismatched checksum, `overwrite` unset), or a
 * deliberate replace (`overwrite` set) — never a silent, unrequested
 * overwrite. Callers that derive `key` from a pengim syllable plus speaker
 * (see lingualibre-rehost.ts's `slugAssetFilename`) only collide here when
 * that really is the same clip, or a confirmed-stale leftover being
 * knowingly resynced.
 */
export async function uploadBytesToS3(
  bytes: Buffer,
  options: UploadBytesToS3Options,
): Promise<UploadBytesToS3Result> {
  const { key, contentType, overwrite = false, headObject = defaultHeadObject, putObject = defaultPutObject } = options
  const checksum = sha256(bytes)
  const url = `${AUDIO_CDN_BASE}/${key}`

  const existing = await headObject(key)
  if (existing !== undefined) {
    if (existing.checksum === checksum) {
      return { url, checksum }
    }
    if (!overwrite) {
      throw new Error(
        `refusing to overwrite s3://${AUDIO_BUCKET}/${key} — existing object has checksum ` +
          `${existing.checksum ?? '(none recorded)'}, this upload has ${checksum}. Use a different key for a ` +
          'genuinely new clip (e.g. a different speaker), or pass overwrite if this key is confirmed stale.',
      )
    }
  }

  await putObject({ key, body: bytes, contentType, checksum })
  return { url, checksum }
}
