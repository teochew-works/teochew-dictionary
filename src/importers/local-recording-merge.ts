import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument, stringify } from 'yaml'

import { AUDIO_METADATA_DIR, ROOT } from '../paths.js'
import { loadOptionalFile } from '../phonology/load.js'
import { audioSchema, CONFIDENCE, type Audio } from '@teochew/core'
import type { LocalRecordingProposal } from './local-recording-types.js'
import { LOCAL_RECORDING_SOURCE, removeLocalRecordingProposal } from './local-recording-staging.js'
import { rehostLocalRecording, resolveLocalRecordingProposal, type LocalRehostOptions } from './local-recording-rehost.js'

/**
 * Re-hosts a staged local-recording proposal and writes it straight into
 * `data/phonology/audio/<variety>.yaml` (issue #128, `data/phonology/
 * REVIEW.md` § 17) — the same mechanical merge `mergeLinguaLibreClip`
 * (./lingualibre-merge.js) does, minus the licence lookup: every local
 * recording cites the fixed `teochew-dictionary-audio` source, never a
 * per-clip licence recovered from import metadata. Always writes into
 * `clips`, never `wordClips` — the Sounds tab's record control only ever
 * captures a single syllable.
 */

export { resolveLocalRecordingProposal }

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
   * A distinct speaker's clip at an already-used key is always appended — no
   * flag needed. `force` only matters when `proposal.speaker` already has a
   * clip at this key: without it, that's refused; with it, that speaker's
   * existing clip is replaced (issue #134).
   */
  force?: boolean
  /** Injectable for tests — avoids writing into the real data/phonology/audio/. */
  audioDir?: string
  /** Injectable for tests — avoids resolving proposal.localPath against the real repo root. */
  rootDir?: string
  /**
   * `proposal`'s index in data/staging/teochew-dictionary-audio.yaml. When
   * given, a successful merge removes that staged proposal and its local
   * recording file (both now redundant once the clip lives on a Release).
   * Omit to skip that cleanup — e.g. in a test with no real staging file.
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
}

export async function mergeLocalRecording(
  proposal: LocalRecordingProposal,
  options: MergeLocalRecordingOptions,
): Promise<MergeLocalRecordingResult> {
  const {
    variety,
    confidence = 'high',
    force = false,
    audioDir = AUDIO_METADATA_DIR,
    rootDir = ROOT,
    proposalIndex,
    stagingDir,
    readBytes,
    ...rehostOptions
  } = options

  const key = proposal.pengim

  const path = join(audioDir, `${variety}.yaml`)
  const audio: Audio = loadAudioFile(path) ?? { audio: { id: variety, variety }, clips: {}, wordClips: {} }

  const existingClips = audio.clips ?? {}
  const existingList = Object.hasOwn(existingClips, key) ? existingClips[key]! : []
  const dupIndex = existingList.findIndex((c) => c.speaker === proposal.speaker)
  if (dupIndex !== -1 && !force) {
    throw new Error(
      `'${proposal.speaker}' already has a clip at '${key}' in clips for '${variety}' (${path}) — pass --force to overwrite`,
    )
  }

  const { url, checksum } = await rehostLocalRecording(proposal, {
    ...rehostOptions,
    readBytes: readBytes ?? ((p) => readFileSync(join(rootDir, p))),
  })

  const clip = {
    url,
    checksum,
    confidence,
    sources: [LOCAL_RECORDING_SOURCE],
    speaker: proposal.speaker,
    recorded: proposal.recordedDate,
  }

  const newList =
    dupIndex !== -1 ? existingList.map((c, i) => (i === dupIndex ? clip : c)) : [...existingList, clip]

  const updated: Audio = audioSchema.parse({ ...audio, clips: { ...existingClips, [key]: newList } })

  mkdirSync(audioDir, { recursive: true })

  // Same comment-preserving mutate-in-place mergeLinguaLibreClip uses: a
  // fresh stringify of an existing file would silently drop any hand-written
  // comments (audioFileHeader's own text invites editing a clip by hand).
  if (existsSync(path)) {
    const doc = parseDocument(readFileSync(path, 'utf8'))
    doc.setIn(['clips', key], updated.clips![key])
    writeFileSync(path, doc.toString())
  } else {
    writeFileSync(path, audioFileHeader(variety) + stringify(updated))
  }

  if (proposalIndex !== undefined) {
    removeLocalRecordingProposal(proposalIndex, stagingDir)
    rmSync(join(rootDir, proposal.localPath), { force: true })
  }

  return { path, variety, key, url, checksum }
}
