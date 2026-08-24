import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument, stringify } from 'yaml'

import { loadSources } from '../data/load.js'
import { AUDIO_METADATA_DIR } from '../paths.js'
import { loadOptionalFile } from '../phonology/load.js'
import { audioSchema, CONFIDENCE, type Audio } from '../schema/phonology.js'
import type { Source } from '../schema/entry.js'
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
 * Commons reports). Each gets its own source id (`lingualibre`,
 * `lingualibre-ccby4`, `lingualibre-cc0`, …) rather than being folded into
 * one, so a merged clip's `sources` never overstates — or understates — the
 * licence obligation a specific file actually carries.
 *
 * Looked up against `sources` (the caller passes `loadSources()`) rather than
 * a hardcoded table, so covering a new Commons-reported licence variant is a
 * `data/sources.yaml` addition, not a code change here — and so this stays a
 * pure lookup a test can exercise against a small fixture list. Returns
 * `null` when no `lingualibre*` source's own `licence` matches, which callers
 * must refuse to merge rather than guess.
 */
export function licenceSourceId(licence: string, sources: Source[]): string | null {
  const normalised = licence.trim().toUpperCase().replace(/\s+/gu, '-')
  return sources.find((s) => s.id.startsWith('lingualibre') && s.licence === normalised)?.id ?? null
}

function loadAudioFile(path: string): Audio | null {
  return loadOptionalFile(path, audioSchema)
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
  /**
   * A distinct speaker's clip at an already-used key is always appended — no
   * flag needed. `force` only matters when `proposal.speaker` already has a
   * clip at this key: without it, that's refused; with it, that speaker's
   * existing clip is replaced (issue #134).
   */
  force?: boolean
  /** Injectable for tests — avoids writing into the real data/phonology/audio/. */
  audioDir?: string
  /** Injectable for tests — avoids depending on the real data/sources.yaml; defaults to `loadSources()`. */
  sources?: Source[]
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
  const {
    variety,
    confidence = 'high',
    force = false,
    audioDir = AUDIO_METADATA_DIR,
    sources = loadSources(),
    ...rehostOptions
  } = options

  const sourceId = licenceSourceId(proposal.licence, sources)
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
  const existingList = Object.hasOwn(existingBucket, key) ? existingBucket[key]! : []
  const dupIndex = existingList.findIndex((c) => c.speaker === proposal.speaker)
  if (dupIndex !== -1 && !force) {
    throw new Error(
      `'${proposal.speaker}' already has a clip at '${key}' in ${bucket} for '${variety}' (${path}) — pass --force to overwrite`,
    )
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

  const newList =
    dupIndex !== -1 ? existingList.map((c, i) => (i === dupIndex ? clip : c)) : [...existingList, clip]

  const updated: Audio = audioSchema.parse({
    ...audio,
    [bucket]: { ...existingBucket, [key]: newList },
  })

  mkdirSync(audioDir, { recursive: true })

  // Round-tripping an *existing* file through a plain object and `stringify`
  // would silently drop any hand-written comments (audioFileHeader's own text
  // invites editing a clip by hand) — parseDocument/setIn mutate just the one
  // clip in place, leaving the rest of the document, comments included,
  // untouched. A brand-new file has no comments to lose, so it's built fresh
  // with the generated header as before.
  if (existsSync(path)) {
    const doc = parseDocument(readFileSync(path, 'utf8'))
    doc.setIn([bucket, key], updated[bucket]![key])
    writeFileSync(path, doc.toString())
  } else {
    writeFileSync(path, audioFileHeader(variety) + stringify(updated))
  }

  return { path, variety, key, bucket, sourceId, url, checksum }
}
