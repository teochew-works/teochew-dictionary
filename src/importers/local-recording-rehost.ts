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

export interface ResolveProposalsOptions {
  /**
   * Narrows a `pengim` match to proposals staged for this variety. The CLI
   * passes its `--variety`, so `--all` for a syllable recorded in two
   * varieties cannot sweep both into one variety's manifest. A numeric index
   * deliberately ignores this — merging a proposal into a variety other than
   * the one it was staged under is a judgment call a human is allowed to make
   * (REVIEW.md § 16), and naming the index is how they make it explicitly.
   */
  variety?: string
}

/**
 * Resolves a CLI arg to the staged proposals it names: a numeric index (at
 * most one), or an exact `pengim` match — *every* proposal for that syllable,
 * in staging order, not just the first.
 *
 * Plural since ADR-0029 (issue #290): the elicitation UI stages several takes
 * of one target under one pengim key, and a `.find()` here made every take but
 * the earliest unreachable by name. The caller decides what to do with more
 * than one — `src/cli/local-recording-merge.ts` merges them all under `--all`,
 * and otherwise lists them and asks which.
 */
export function resolveLocalRecordingProposals(
  arg: string,
  proposals: LocalRecordingProposal[],
  options: ResolveProposalsOptions = {},
): LocalRecordingProposal[] {
  const asIndex = Number(arg)
  if (Number.isInteger(asIndex) && String(asIndex) === arg) {
    const proposal = proposals[asIndex]
    return proposal ? [proposal] : []
  }
  return proposals.filter((p) => p.pengim === arg && (options.variety === undefined || p.variety === options.variety))
}

/**
 * A plain-ASCII asset filename derived from the proposal's pengim key and
 * speaker, keeping the local file's own extension. Takes a proposal with
 * `speaker` resolved — `LocalRecordingProposal` itself leaves it optional
 * (issue #288's deferred-assignment case) but re-hosting only ever happens
 * once a speaker id has been decided. `take` (ADR-0029, issue #290) is not
 * on `LocalRecordingProposal` either — the merge step decides it — so it is
 * passed in explicitly, same as `lingualibre-rehost.ts`'s `assetFilename`.
 */
export function assetFilename(proposal: LocalRecordingProposal & { speaker: string }, take?: number): string {
  return slugAssetFilename(proposal.pengim, proposal.speaker, proposal.localPath, take)
}

export interface LocalRehostOptions {
  /** Injectable for tests — avoids reading a real file. */
  readBytes?: (path: string) => Buffer
  /** Injectable for tests — avoids a real AWS call. */
  headObject?: UploadBytesToS3Options['headObject']
  /** Injectable for tests — avoids a real AWS call. */
  putObject?: UploadBytesToS3Options['putObject']
  /**
   * Bytes the caller has already read. `mergeLocalRecording` hashes before it
   * uploads (a clip's identity is its checksum, ADR-0029), so it has them in
   * hand by the time it gets here and passing them saves re-reading the file.
   */
  bytes?: Buffer
  /**
   * Which take of this speaker's recording of this key this is (ADR-0029,
   * issue #290) — forwarded to `assetFilename`/`audioAssetPath`. Absent
   * means the speaker's first take at this key, reproducing today's path.
   */
  take?: number
}

export interface LocalRehostResult {
  proposal: LocalRecordingProposal
  url: string
  checksum: string
}

/** `proposal`'s raw bytes, read the way `rehostLocalRecording` would — so a caller can checksum them before deciding to publish them (ADR-0029). */
export function localRecordingBytes(proposal: LocalRecordingProposal, options: LocalRehostOptions = {}): Buffer {
  const { readBytes = (path: string) => readFileSync(path), bytes } = options
  return bytes ?? readBytes(proposal.localPath)
}

export async function rehostLocalRecording(
  proposal: LocalRecordingProposal & { speaker: string },
  options: LocalRehostOptions = {},
): Promise<LocalRehostResult> {
  const { headObject, putObject, take } = options

  const bytes = localRecordingBytes(proposal, options)
  const filename = assetFilename(proposal, take)
  const { url, checksum } = await uploadBytesToS3(bytes, {
    key: audioClipKey(filename),
    contentType: contentTypeForFilename(filename),
    headObject,
    putObject,
  })

  return { proposal, url, checksum }
}
