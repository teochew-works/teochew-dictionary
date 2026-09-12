import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import {
  audioAssetPath,
  audioClipKey,
  contentTypeForFilename,
  uploadBytesToS3,
  type UploadBytesToS3Options,
} from './s3-upload.js'
import type { AudioClipProposal } from './audio-types.js'

/**
 * Re-hosts one staged Lingua Libre proposal's bytes to S3 behind CloudFront
 * (issue #270; ADR-0026) — downloads from Commons, checksums, uploads via
 * `uploadBytesToS3`, and returns the `url`/`checksum` pair ready to paste
 * into a `data/phonology/audio/<variety>.yaml` clip entry.
 *
 * Deliberately per-clip, not a bulk operation: re-hosting is only worth
 * doing once a human has decided a clip is worth keeping (right
 * variety/accent, transcription matches a real entry) — see REVIEW.md §
 * 16's "explicitly out of scope" note. Driven by `src/cli/lingualibre-
 * rehost.ts`; kept separate from that thin CLI script (a bare top-level
 * script body, like every other file under src/cli/) so this logic stays
 * importable and unit-testable.
 */

/** Resolves a CLI arg to a staged proposal: a numeric index, or an exact `commonsTitle` match. */
export function resolveProposal(arg: string, proposals: AudioClipProposal[]): AudioClipProposal | undefined {
  const asIndex = Number(arg)
  if (Number.isInteger(asIndex) && String(asIndex) === arg) return proposals[asIndex]
  return proposals.find((p) => p.commonsTitle === arg)
}

/**
 * A plain-ASCII `<speaker>/<pengim-key><ext>` relative path (see
 * `audioAssetPath`, s3-upload.ts), keeping whatever extension
 * `sourcePathOrUrl` ends in (falling back to `.wav`). Shared by
 * `assetFilename` below and `local-recording-rehost.ts`'s equivalent, which
 * derives a path from a local file path rather than a Commons URL.
 *
 * `speaker` disambiguates the path, not just `key`, because
 * `mergeLinguaLibreClip`/`mergeLocalRecording` explicitly let a distinct
 * speaker's clip append at an already-used pengim key with no flag needed —
 * a path keyed on `key` alone would let a second speaker's upload silently
 * collide with (or get refused against) the first speaker's clip.
 */
export function slugAssetFilename(key: string, speaker: string, sourcePathOrUrl: string): string {
  const ext = sourcePathOrUrl.match(/\.[a-zA-Z0-9]+$/u)?.[0]?.toLowerCase() ?? '.wav'
  return audioAssetPath(key, speaker, ext)
}

/** A plain-ASCII, hyphenated asset filename derived from the proposal's pengim key and speaker, keeping the source's own extension. */
export function assetFilename(proposal: AudioClipProposal): string {
  return slugAssetFilename(proposal.pengim, proposal.speaker, proposal.commonsUrl)
}

/**
 * Unlike the Commons API calls in lingualibre.ts, this hits
 * upload.wikimedia.org directly for the clip bytes themselves — the actual
 * bulk transfer, and previously the one path in this importer with no 429
 * handling at all. Routed through fetchWithRetry for the same reason those
 * calls are: Wikimedia's edge limiter applies here too, not just to api.php.
 */
async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

export interface RehostOptions {
  /** Injectable for tests — avoids a real network call. */
  fetchBytes?: (url: string) => Promise<Buffer>
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: UploadBytesToS3Options['headObject']
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: UploadBytesToS3Options['putObject']
}

export interface RehostResult {
  proposal: AudioClipProposal
  url: string
  checksum: string
}

export async function rehostClip(proposal: AudioClipProposal, options: RehostOptions = {}): Promise<RehostResult> {
  const { fetchBytes = defaultFetchBytes, headObject, putObject } = options

  const bytes = await fetchBytes(proposal.commonsUrl)
  const filename = assetFilename(proposal)
  const { url, checksum } = await uploadBytesToS3(bytes, {
    key: audioClipKey(filename),
    contentType: contentTypeForFilename(filename),
    headObject,
    putObject,
  })

  return { proposal, url, checksum }
}
