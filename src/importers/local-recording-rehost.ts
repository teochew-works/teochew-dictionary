import { readFileSync } from 'node:fs'

import { slugAssetFilename } from './lingualibre-rehost.js'
import { audioClipKey, contentTypeForFilename, uploadBytesToS3, type UploadBytesToS3Options } from './s3-upload.js'
import type { LocalRecordingProposal } from './local-recording-types.js'

/**
 * Re-hosts one staged local-recording proposal's bytes to S3 (issue #128,
 * `data/phonology/REVIEW.md` § 17; S3 write path per issue #270) — the same
 * checksum/upload mechanics `lingualibre-rehost.ts` uses, minus the fetch: a
 * local recording's bytes are already on disk at `proposal.localPath`,
 * staged there by the Sounds tab's record control.
 */

/** Resolves a CLI arg to a staged proposal: a numeric index, or an exact `pengim` match. */
export function resolveLocalRecordingProposal(
  arg: string,
  proposals: LocalRecordingProposal[],
): LocalRecordingProposal | undefined {
  const asIndex = Number(arg)
  if (Number.isInteger(asIndex) && String(asIndex) === arg) return proposals[asIndex]
  return proposals.find((p) => p.pengim === arg)
}

/** A plain-ASCII asset filename derived from the proposal's pengim key and speaker, keeping the local file's own extension. */
export function assetFilename(proposal: LocalRecordingProposal): string {
  return slugAssetFilename(proposal.pengim, proposal.speaker, proposal.localPath)
}

export interface LocalRehostOptions {
  /** Injectable for tests — avoids reading a real file. */
  readBytes?: (path: string) => Buffer
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: UploadBytesToS3Options['headObject']
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: UploadBytesToS3Options['putObject']
}

export interface LocalRehostResult {
  proposal: LocalRecordingProposal
  url: string
  checksum: string
}

export async function rehostLocalRecording(
  proposal: LocalRecordingProposal,
  options: LocalRehostOptions = {},
): Promise<LocalRehostResult> {
  const { readBytes = (path) => readFileSync(path), headObject, putObject } = options

  const bytes = readBytes(proposal.localPath)
  const filename = assetFilename(proposal)
  const { url, checksum } = await uploadBytesToS3(bytes, {
    key: audioClipKey(filename),
    contentType: contentTypeForFilename(filename),
    headObject,
    putObject,
  })

  return { proposal, url, checksum }
}
