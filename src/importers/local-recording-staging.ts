import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, parseDocument, stringify } from 'yaml'

import { STAGING_DIR } from './staging.js'
import type { LocalRecordingProposal } from './local-recording-types.js'

/**
 * Writes/reads `data/staging/teochew-dictionary-audio.yaml` — proposals
 * staged by the Sounds tab's dev-only record control (issue #128,
 * `data/phonology/REVIEW.md` § 17). Same directory/one-file-per-source
 * convention as `audio-staging.ts`'s `data/staging/lingualibre.yaml`, but a
 * different write shape: a batch importer overwrites its staging file once
 * per run, whereas a recording happens one at a time, so this file is built
 * up incrementally — `appendLocalRecordingProposal` mutates the existing
 * document in place (preserving any hand-added review notes) rather than
 * regenerating it from scratch.
 */

export const LOCAL_RECORDING_SOURCE = 'teochew-dictionary-audio'

function stagingPath(stagingDir: string): string {
  return join(stagingDir, `${LOCAL_RECORDING_SOURCE}.yaml`)
}

function header(): string {
  return [
    '# Locally-recorded clip proposals — NOT part of the dataset.',
    '#',
    "# Appended one at a time by the Sounds tab's dev-only record control",
    '# (data/phonology/REVIEW.md § 17). Review each proposal — listen to the',
    '# clip at its `localPath`, check the pengim key and speaker id — then run',
    '# `npm run merge:local-recording -- <index> --variety=<id>`: re-hosts the',
    '# bytes to a GitHub Release and writes the clip straight into',
    '# data/phonology/audio/<variety>.yaml.',
    '',
  ].join('\n')
}

/** Appends one proposal to data/staging/teochew-dictionary-audio.yaml, creating it on first use. */
export function appendLocalRecordingProposal(proposal: LocalRecordingProposal, stagingDir: string = STAGING_DIR): string {
  mkdirSync(stagingDir, { recursive: true })
  const path = stagingPath(stagingDir)

  if (existsSync(path)) {
    const doc = parseDocument(readFileSync(path, 'utf8'))
    doc.addIn(['proposals'], proposal)
    writeFileSync(path, doc.toString())
  } else {
    writeFileSync(path, header() + stringify({ source: LOCAL_RECORDING_SOURCE, proposals: [proposal] }))
  }

  return path
}

/** Reads back what appendLocalRecordingProposal has written so far. */
export function readLocalRecordingStaging(stagingDir: string = STAGING_DIR): { proposals: LocalRecordingProposal[] } | null {
  const path = stagingPath(stagingDir)
  if (!existsSync(path)) return null
  const raw = parseYaml(readFileSync(path, 'utf8')) as { proposals?: LocalRecordingProposal[] }
  return { proposals: raw.proposals ?? [] }
}

/**
 * Every currently-staged proposal for one pengim+variety pair, sorted by
 * descending index. Descending order matters for a caller (saveRecording)
 * that deletes every match: removeLocalRecordingProposal splices the YAML
 * sequence, so deleting a lower index first would shift later indices down
 * and corrupt any indices computed earlier in the same pass.
 */
export function findLocalRecordingProposals(
  pengim: string,
  variety: string,
  stagingDir: string = STAGING_DIR,
): { index: number; proposal: LocalRecordingProposal }[] {
  const staged = readLocalRecordingStaging(stagingDir)
  if (!staged) return []
  return staged.proposals
    .map((proposal, index) => ({ index, proposal }))
    .filter(({ proposal }) => proposal.pengim === pengim && proposal.variety === variety)
    .sort((a, b) => b.index - a.index)
}

/** Removes one proposal by its array index — called once its clip has been merged. */
export function removeLocalRecordingProposal(index: number, stagingDir: string = STAGING_DIR): void {
  const path = stagingPath(stagingDir)
  if (!existsSync(path)) return
  const doc = parseDocument(readFileSync(path, 'utf8'))
  doc.deleteIn(['proposals', index])
  writeFileSync(path, doc.toString())
}
