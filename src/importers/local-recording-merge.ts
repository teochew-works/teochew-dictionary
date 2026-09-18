import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument, stringify } from 'yaml'

import { AUDIO_METADATA_DIR, ROOT } from '../paths.js'
import { loadOptionalFile } from '../phonology/load.js'
import { audioSchema, CONFIDENCE, type Audio } from '@teochew/core'
import type { LocalRecordingProposal } from './local-recording-types.js'
import { LOCAL_RECORDING_SOURCE, removeLocalRecordingProposal } from './local-recording-staging.js'
import {
  localRecordingBytes,
  rehostLocalRecording,
  resolveLocalRecordingProposals,
  type LocalRehostOptions,
} from './local-recording-rehost.js'
import { applyTakePlanToDoc, applyTakePlanToList, planTakeMerge, takeFields, type TakeDisposition } from './clip-takes.js'
import { checksumBytes } from './s3-upload.js'

/**
 * Re-hosts a staged local-recording proposal and writes it straight into
 * `data/phonology/audio/<variety>.yaml` (issue #128, `data/phonology/
 * REVIEW.md` § 17) — the same mechanical merge `mergeLinguaLibreClip`
 * (./lingualibre-merge.js) does, minus the licence lookup: every local
 * recording cites the fixed `teochew-dictionary-audio` source, never a
 * per-clip licence recovered from import metadata. Always writes into
 * `clips`, never `wordClips` — the Sounds tab's record control only ever
 * captures a single syllable.
 *
 * Since ADR-0029 (issue #290) a speaker may hold more than one clip at a key:
 * the bytes are hashed first, an identical clip already at the key is a no-op,
 * and anything else appends — as this speaker's first take, or as
 * `take: N + 1` at its own immutable asset path. `./clip-takes.js` holds that
 * decision, shared with the Lingua Libre merge.
 */

export { resolveLocalRecordingProposals }

function loadAudioFile(path: string): Audio | null {
  return loadOptionalFile(path, audioSchema)
}

function audioFileHeader(variety: string): string {
  return [
    `# Audio clip metadata for the '${variety}' variety (data/phonology/REVIEW.md § 11, § 12).`,
    '#',
    '# Hand-maintained, not wholly regenerated: entries arrive via `npm run',
    '# merge:lingualibre` (issue #106), `npm run merge:local-recording` (issue',
    '# #128), or a direct hand edit. Editing an existing clip by hand is fine —',
    '# just keep it valid against audioSchema in',
    '# packages/core/src/schema/phonology.ts, and',
    '# re-run `npm run validate` after.',
    '',
  ].join('\n')
}

export interface MergeLocalRecordingOptions extends LocalRehostOptions {
  variety: string
  confidence?: (typeof CONFIDENCE)[number]
  /**
   * Designate the merged clip as the take this speaker publishes, moving
   * `primary: true` off whichever of their takes holds it (ADR-0029). Off by
   * default, which is #288's case: a new take lands training-only and what a
   * learner hears cannot change. Ignored when this is the speaker's first clip
   * at the key — a lone clip is implicitly primary already.
   */
  primary?: boolean
  /** Injectable for tests — avoids writing into the real data/phonology/audio/. */
  audioDir?: string
  /** Injectable for tests — avoids resolving proposal.localPath against the real repo root. */
  rootDir?: string
  /**
   * `proposal`'s index in data/staging/teochew-dictionary-audio.yaml. When
   * given, a successful merge removes that staged proposal and its local
   * recording file (both now redundant once the clip is published). An
   * `already-merged` result counts as success for this purpose: those exact
   * bytes are already in the bucket, so the staged copy is just as redundant,
   * and a re-run after an interrupted cleanup finishes the job rather than
   * leaving the proposal staged forever. Omit to skip the cleanup — e.g. in a
   * test with no real staging file.
   */
  proposalIndex?: number
  /** Injectable for tests — avoids touching the real data/staging/. */
  stagingDir?: string
}

export interface MergeLocalRecordingResult {
  path: string
  variety: string
  key: string
  url: string
  checksum: string
  /** What the merge did — see `TakeDisposition` (./clip-takes.js). The CLI prints a line per disposition. */
  disposition: TakeDisposition
  /** The take number this clip carries at the key; 1 means the speaker's first, written with no `take` field. */
  take: number
  /** Whether this clip is the one of its speaker's takes that leaves `data/` — explicitly or, when it is alone, implicitly. */
  primary: boolean
}

export async function mergeLocalRecording(
  proposal: LocalRecordingProposal,
  options: MergeLocalRecordingOptions,
): Promise<MergeLocalRecordingResult> {
  const {
    variety,
    confidence = 'high',
    primary = false,
    audioDir = AUDIO_METADATA_DIR,
    rootDir = ROOT,
    proposalIndex,
    stagingDir,
    readBytes,
    ...rehostOptions
  } = options

  const key = proposal.pengim

  // Deliberately optional on `LocalRecordingProposal` (issue #288: the
  // elicitation UI defers speaker assignment to this merge step) — a caller
  // must resolve one (e.g. the CLI's `--speaker` flag) before merging.
  const speaker = proposal.speaker
  if (!speaker) {
    throw new Error(`proposal for '${key}' has no speaker recorded — resolve one before merging (e.g. --speaker=<id>)`)
  }
  const resolvedProposal = { ...proposal, speaker }

  const path = join(audioDir, `${variety}.yaml`)
  const audio: Audio = loadAudioFile(path) ?? { audio: { id: variety, variety }, clips: {}, wordClips: {} }

  const existingClips = audio.clips ?? {}
  const existingList = Object.hasOwn(existingClips, key) ? existingClips[key]! : []

  // Hashed before anything is uploaded, because the checksum is what decides
  // whether to upload at all (ADR-0029): re-running a merge that already
  // succeeded must cost nothing and change nothing, not re-publish bytes.
  const rehostWithRoot = { ...rehostOptions, readBytes: readBytes ?? ((p: string) => readFileSync(join(rootDir, p))) }
  const bytes = localRecordingBytes(proposal, rehostWithRoot)
  const checksum = checksumBytes(bytes)

  const plan = planTakeMerge(existingList, { speaker, checksum, primary })

  /** Drops the staged proposal and its local file — the clip is published, so both are redundant. */
  const cleanUpStaging = (): void => {
    if (proposalIndex === undefined) return
    removeLocalRecordingProposal(proposalIndex, stagingDir)
    rmSync(join(rootDir, proposal.localPath), { force: true })
  }

  if (plan.disposition === 'already-merged') {
    const existing = existingList[plan.existingIndex!]!
    cleanUpStaging()
    return {
      path,
      variety,
      key,
      url: existing.url,
      checksum,
      disposition: plan.disposition,
      take: plan.take,
      primary: plan.primary,
    }
  }

  const { url } = await rehostLocalRecording(resolvedProposal, {
    ...rehostWithRoot,
    bytes,
    // Absent for a first take, so that clip lands at exactly the path it
    // would have before ADR-0029; present for any later take, which is what
    // makes the paths immutable and `--force` unnecessary.
    ...(plan.take > 1 ? { take: plan.take } : {}),
  })

  const clip = {
    url,
    checksum,
    confidence,
    sources: [LOCAL_RECORDING_SOURCE],
    speaker,
    recorded: proposal.recordedDate,
    ...takeFields(plan),
  }

  const newList = applyTakePlanToList(existingList, clip, plan)

  // Parsed before anything is written: proves the whole key — the appended
  // clip and any spliced `primary` marker alike — is valid against the schema
  // rather than leaving `npm run validate` to discover it afterwards.
  const updated: Audio = audioSchema.parse({ ...audio, clips: { ...existingClips, [key]: newList } })

  mkdirSync(audioDir, { recursive: true })

  // Same comment-preserving mutate-in-place mergeLinguaLibreClip uses: a
  // fresh stringify of an existing file would silently drop any hand-written
  // comments (audioFileHeader's own text invites editing a clip by hand).
  if (existsSync(path)) {
    const doc = parseDocument(readFileSync(path, 'utf8'))
    applyTakePlanToDoc(doc, 'clips', key, clip, plan)
    writeFileSync(path, doc.toString())
  } else {
    writeFileSync(path, audioFileHeader(variety) + stringify(updated))
  }

  cleanUpStaging()

  return {
    path,
    variety,
    key,
    url,
    checksum,
    disposition: plan.disposition,
    take: plan.take,
    // A first take is primary without saying so; a later one only when asked.
    primary: plan.disposition === 'appended-first' || plan.primary,
  }
}
