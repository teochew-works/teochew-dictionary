import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument, stringify } from 'yaml'

import { loadSources } from '../data/load.js'
import { AUDIO_METADATA_DIR } from '../paths.js'
import { loadOptionalFile } from '../phonology/load.js'
import { audioSchema, CONFIDENCE, type Audio, type Source } from '@teochew/core'
import type { AudioClipProposal } from './audio-types.js'
import { linguaLibreClipBytes, rehostClip, resolveProposal, type RehostOptions } from './lingualibre-rehost.js'
import { applyTakePlanToDoc, applyTakePlanToList, planTakeMerge, takeFields, type TakeDisposition } from './clip-takes.js'
import { checksumBytes } from './s3-upload.js'

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
    '# packages/core/src/schema/phonology.ts, and re-run `npm run validate` after.',
    '',
  ].join('\n')
}

export interface MergeOptions extends RehostOptions {
  variety: string
  confidence?: (typeof CONFIDENCE)[number]
  /**
   * Designate the merged clip as the take this speaker publishes, moving
   * `primary: true` off whichever of their takes holds it (ADR-0029). Off by
   * default: a further recording of a syllable this speaker already has lands
   * training-only, and what a learner hears cannot change behind their back.
   * Ignored when this is the speaker's first clip at the key — a lone clip is
   * implicitly primary already.
   */
  primary?: boolean
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
  /** What the merge did — see `TakeDisposition` (./clip-takes.js). The CLI prints a line per disposition. */
  disposition: TakeDisposition
  /** The take number this clip carries at the key; 1 means the speaker's first, written with no `take` field. */
  take: number
  /** Whether this clip is the one of its speaker's takes that leaves `data/` — explicitly or, when it is alone, implicitly. */
  primary: boolean
}

/**
 * Re-hosts `proposal`'s bytes (via `rehostClip`) and merges the resulting
 * clip into `data/phonology/audio/<variety>.yaml`, creating the file if this
 * is the variety's first clip. `variety` is required and never guessed — the
 * importer deliberately doesn't judge accent fit (REVIEW.md § 16), so a
 * caller (a human, via the CLI) must supply it.
 *
 * Re-running it against an already-merged proposal can't clobber the clip a
 * human chose among duplicate candidates, and no longer needs to refuse either
 * (ADR-0029, issue #290): the bytes are hashed before the upload, identical
 * bytes already at the key are a no-op, and a genuinely new recording from a
 * speaker who already has one here appends as `take: N + 1` at its own
 * immutable path. `./clip-takes.js` holds that decision, shared with
 * `mergeLocalRecording`.
 */
export async function mergeLinguaLibreClip(proposal: AudioClipProposal, options: MergeOptions): Promise<MergeResult> {
  const {
    variety,
    confidence = 'high',
    primary = false,
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

  // Fetched and hashed before anything is uploaded, because the checksum is
  // what decides whether to upload at all (ADR-0029): re-running a merge that
  // already succeeded must cost nothing and change nothing.
  const bytes = await linguaLibreClipBytes(proposal, rehostOptions)
  const checksum = checksumBytes(bytes)

  const plan = planTakeMerge(existingList, { speaker: proposal.speaker, checksum, primary })

  if (plan.disposition === 'already-merged') {
    const existing = existingList[plan.existingIndex!]!
    return {
      path,
      variety,
      key,
      bucket,
      sourceId,
      url: existing.url,
      checksum,
      disposition: plan.disposition,
      take: plan.take,
      primary: plan.primary,
    }
  }

  const { url } = await rehostClip(proposal, {
    ...rehostOptions,
    bytes,
    // Absent for a first take, so that clip lands at exactly the path it would
    // have before ADR-0029; present for any later take, which is what makes
    // the paths immutable and `--force` unnecessary.
    ...(plan.take > 1 ? { take: plan.take } : {}),
  })

  const clip = {
    url,
    checksum,
    confidence,
    sources: [sourceId],
    speaker: proposal.speaker,
    ...(proposal.uploadDate ? { recorded: proposal.uploadDate } : {}),
    ...takeFields(plan),
  }

  const newList = applyTakePlanToList(existingList, clip, plan)

  // Parsed before anything is written: proves the whole key — the appended
  // clip and any spliced `primary` marker alike — is valid against the schema
  // rather than leaving `npm run validate` to discover it afterwards.
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
    applyTakePlanToDoc(doc, bucket, key, clip, plan)
    writeFileSync(path, doc.toString())
  } else {
    writeFileSync(path, audioFileHeader(variety) + stringify(updated))
  }

  return {
    path,
    variety,
    key,
    bucket,
    sourceId,
    url,
    checksum,
    disposition: plan.disposition,
    take: plan.take,
    // A first take is primary without saying so; a later one only when asked.
    primary: plan.disposition === 'appended-first' || plan.primary,
  }
}
