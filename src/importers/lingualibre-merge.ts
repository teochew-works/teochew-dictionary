import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { AUDIO_METADATA_DIR } from '../paths.js'
import { audioSchema, CONFIDENCE, type Audio } from '../schema/phonology.js'
import type { AudioClipProposal } from './audio-types.js'
import { rehostClip, resolveProposal, type RehostOptions } from './lingualibre-rehost.js'

/**
 * Re-hosts a staged Lingua Libre proposal and writes it straight into
 * `data/phonology/audio/<variety>.yaml` — the mechanical half of the merge
 * process `data/phonology/REVIEW.md` § 16 describes, which until now had to
 * be done by hand (see `../importers/audio-staging.js`'s header comment).
 * The judgment half — does this recording actually match the entry, is
 * `variety` the right accent — stays a human decision: this module never
 * picks a proposal or a variety on its own, only mechanises what happens
 * once a human has.
 */

export { resolveProposal }

/**
 * Maps a proposal's raw Commons-reported licence to the `data/sources.yaml`
 * id that actually covers it. The Teochew pronunciation category defaults to
 * CC-BY-SA-4.0, but a per-file Commons `imageinfo` licence can report
 * CC-BY-4.0 or CC0 instead (`normaliseLicence` in `./lingualibre.js` only
 * canonicalises the expected value, so these arrive as the raw strings
 * Commons reports). Each gets its own source id rather than being folded
 * into `lingualibre`, so a merged clip's `sources` never overstates — or
 * understates — the licence obligation a specific file actually carries.
 * Returns `null` for anything else, which callers must refuse to merge
 * rather than guess.
 */
export function licenceSourceId(licence: string): string | null {
  const normalised = licence.trim().toUpperCase().replace(/\s+/gu, '-')
  switch (normalised) {
    case 'CC-BY-SA-4.0':
      return 'lingualibre'
    case 'CC-BY-4.0':
      return 'lingualibre-ccby4'
    case 'CC0':
      return 'lingualibre-cc0'
    default:
      return null
  }
}

function loadAudioFile(path: string): Audio | null {
  if (!existsSync(path)) return null
  return audioSchema.parse(parseYaml(readFileSync(path, 'utf8')))
}

function audioFileHeader(variety: string): string {
  return [
    `# Audio clip metadata for the '${variety}' variety (data/phonology/REVIEW.md § 11, § 12).`,
    '#',
    "# Hand-maintained, not wholly regenerated: entries arrive via `npm run",
    '# merge:lingualibre` (issue #106) or a direct hand edit. Editing an existing',
    '# clip by hand is fine — just keep it valid against audioSchema in',
    '# src/schema/phonology.ts, and re-run `npm run validate` after.',
    '',
  ].join('\n')
}

export interface MergeOptions extends RehostOptions {
  variety: string
  confidence?: (typeof CONFIDENCE)[number]
  /** Overwrite an existing clip at the same key instead of refusing. */
  force?: boolean
  /** Injectable for tests — avoids writing into the real data/phonology/audio/. */
  audioDir?: string
}

export interface MergeResult {
  path: string
  variety: string
  key: string
  bucket: 'clips' | 'wordClips'
  sourceId: string
  url: string
  checksum: string
}

/**
 * Re-hosts `proposal`'s bytes (via `rehostClip`) and merges the resulting
 * clip into `data/phonology/audio/<variety>.yaml`, creating the file if this
 * is the variety's first clip. `variety` is required and never guessed — the
 * importer deliberately doesn't judge accent fit (REVIEW.md § 16), so a
 * caller (a human, via the CLI) must supply it. An existing key is left
 * alone unless `force` is set, so re-running this against an already-merged
 * proposal can't silently clobber a clip a human already chose among
 * duplicate candidates.
 */
export async function mergeLinguaLibreClip(proposal: AudioClipProposal, options: MergeOptions): Promise<MergeResult> {
  const { variety, confidence = 'high', force = false, audioDir = AUDIO_METADATA_DIR, ...rehostOptions } = options

  const sourceId = licenceSourceId(proposal.licence)
  if (!sourceId) {
    throw new Error(
      `'${proposal.commonsTitle}' reports licence '${proposal.licence}', which has no data/sources.yaml ` +
        'mapping (see licenceSourceId) — add one before merging rather than guessing',
    )
  }

  const bucket: 'clips' | 'wordClips' = proposal.syllableCount === 1 ? 'clips' : 'wordClips'
  const key = proposal.pengim

  const path = join(audioDir, `${variety}.yaml`)
  const audio: Audio = loadAudioFile(path) ?? { audio: { id: variety, variety }, clips: {}, wordClips: {} }

  const existingBucket = audio[bucket] ?? {}
  if (existingBucket[key] && !force) {
    throw new Error(`'${key}' already has a clip in ${bucket} for '${variety}' (${path}) — pass --force to overwrite`)
  }

  const { url, checksum } = await rehostClip(proposal, rehostOptions)

  const clip = {
    url,
    checksum,
    confidence,
    sources: [sourceId],
    speaker: proposal.speaker,
    ...(proposal.uploadDate ? { recorded: proposal.uploadDate } : {}),
  }

  const updated: Audio = audioSchema.parse({
    ...audio,
    [bucket]: { ...existingBucket, [key]: clip },
  })

  mkdirSync(audioDir, { recursive: true })
  writeFileSync(path, audioFileHeader(variety) + stringify(updated))

  return { path, variety, key, bucket, sourceId, url, checksum }
}
