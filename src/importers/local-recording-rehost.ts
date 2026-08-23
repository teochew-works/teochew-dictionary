import { readFileSync } from 'node:fs'

import { slugAssetFilename, uploadBytesToRelease, type UploadBytesOptions } from './lingualibre-rehost.js'
import type { LocalRecordingProposal } from './local-recording-types.js'

/**
 * Re-hosts one staged local-recording proposal's bytes as a GitHub Release
 * asset (issue #128, `data/phonology/REVIEW.md` § 17) — the same
 * checksum/`gh release upload` mechanics `lingualibre-rehost.ts` uses, minus
 * the fetch: a local recording's bytes are already on disk at
 * `proposal.localPath`, staged there by the Sounds tab's record control.
 */

export const DEFAULT_LOCAL_RECORDING_TAG = 'audio-teochew-dictionary-audio'

/** Resolves a CLI arg to a staged proposal: a numeric index, or an exact `pengim` match. */
export function resolveLocalRecordingProposal(
  arg: string,
  proposals: LocalRecordingProposal[],
): LocalRecordingProposal | undefined {
  const asIndex = Number(arg)
  if (Number.isInteger(asIndex) && String(asIndex) === arg) return proposals[asIndex]
  return proposals.find((p) => p.pengim === arg)
}

/** A plain-ASCII asset filename derived from the proposal's pengim key, keeping the local file's own extension. */
export function assetFilename(proposal: LocalRecordingProposal): string {
  return slugAssetFilename(proposal.pengim, proposal.localPath)
}

export interface LocalRehostOptions extends Omit<UploadBytesOptions, 'tag' | 'releaseNotes'> {
  tag?: string
  /** Injectable for tests — avoids reading a real file. */
  readBytes?: (path: string) => Buffer
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
  const { tag = DEFAULT_LOCAL_RECORDING_TAG, readBytes = (path) => readFileSync(path), ...uploadOptions } = options

  const bytes = readBytes(proposal.localPath)
  const filename = assetFilename(proposal)
  const { url, checksum } = await uploadBytesToRelease(bytes, filename, {
    ...uploadOptions,
    tag,
    releaseNotes: 'Locally-recorded audio clips — see data/phonology/REVIEW.md § 17.',
  })

  return { proposal, url, checksum }
}
