import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { AUDIO_METADATA_DIR, DATA_DIR, ROOT } from '../../src/paths.js'
import { loadOptionalFile } from '../../src/phonology/load.js'
import { audioSchema } from '../../src/schema/phonology.js'
import { appendLocalRecordingProposal, readLocalRecordingStaging } from '../../src/importers/local-recording-staging.js'
import type { LocalRecordingProposal } from '../../src/importers/local-recording-types.js'

/**
 * Pure request handlers behind the dev-only `/api/local-recordings` route
 * (issue #128, `data/phonology/REVIEW.md` § 17) — kept separate from
 * `local-recordings.ts`'s thin Vite `Plugin`/HTTP wiring so the actual
 * validation and file-writing logic is unit-testable without a running Vite
 * server, mirroring this project's importer/CLI split.
 */

/** The Sounds tab is Chaozhou-only today — matches SOUNDS_VARIETY in src/build/sounds.ts. */
export const VARIETY = 'chaozhou'

export interface StatusResult {
  /** Syllable keys with a published clip in data/phonology/audio/<variety>.yaml. */
  published: string[]
  /** Syllable keys with a proposal already staged, awaiting `npm run merge:local-recording`. */
  pending: string[]
}

export interface StatusDeps {
  audioDir?: string
  stagingDir?: string
}

export function getStatus(deps: StatusDeps = {}): StatusResult {
  const audioPath = join(deps.audioDir ?? AUDIO_METADATA_DIR, `${VARIETY}.yaml`)
  const audio = loadOptionalFile(audioPath, audioSchema)
  const staged = readLocalRecordingStaging(deps.stagingDir)

  return {
    published: Object.keys(audio?.clips ?? {}),
    pending: (staged?.proposals ?? []).filter((p) => p.variety === VARIETY).map((p) => p.pengim),
  }
}

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/wave': '.wav',
  'audio/x-wav': '.wav',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
}

/** Filesystem-safe, not the same slugging `lingualibre-rehost.ts` uses for a pengim key — a speaker pseudonym can contain arbitrary characters. */
function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, '-').replace(/[^a-z0-9-]/gu, '') || 'x'
}

export interface SaveRecordingBody {
  pengim?: unknown
  speaker?: unknown
  recordedDate?: unknown
  consentAcknowledged?: unknown
  audioBase64?: unknown
  mimeType?: unknown
}

export type SaveRecordingResult = { ok: true; localPath: string } | { ok: false; error: string }

export interface SaveRecordingDeps {
  /** Absolute directory to write the raw clip into. Default: data/staging/recordings/<variety>/. */
  recordingsDir?: string
  /** Injectable for tests — avoids a real filesystem write. */
  writeFile?: (path: string, bytes: Buffer) => void
  /** Injectable for tests — defaults to a random id, so re-recording the same syllable twice in a row never collides. */
  idSuffix?: () => string
  /** Injectable for tests — avoids touching the real data/staging/. */
  stagingDir?: string
}

/**
 * Validates and stages one recorded clip: writes the decoded bytes to disk
 * and appends a `LocalRecordingProposal` (via `appendLocalRecordingProposal`)
 * — never touches `data/phonology/audio/*.yaml` directly. Publishing stays a
 * separate, human-run `npm run merge:local-recording` step (REVIEW.md § 17).
 */
export function saveRecording(body: SaveRecordingBody, deps: SaveRecordingDeps = {}): SaveRecordingResult {
  const { pengim, speaker, recordedDate, consentAcknowledged, audioBase64, mimeType } = body

  if (typeof pengim !== 'string' || pengim.trim() === '') return { ok: false, error: 'pengim is required' }
  if (typeof speaker !== 'string' || speaker.trim() === '') return { ok: false, error: 'speaker is required' }
  if (typeof recordedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(recordedDate)) {
    return { ok: false, error: 'recordedDate must be YYYY-MM-DD' }
  }
  if (consentAcknowledged !== true) {
    return { ok: false, error: 'consentAcknowledged must be true — see AUDIO-CONSENT.md' }
  }
  if (typeof audioBase64 !== 'string' || audioBase64 === '') return { ok: false, error: 'audioBase64 is required' }
  // MediaRecorder reports a codec-qualified mimeType (e.g.
  // `audio/webm;codecs=opus`) — only the part before `;` selects an extension.
  const baseMimeType = typeof mimeType === 'string' ? mimeType.split(';')[0]?.trim() : undefined
  if (!baseMimeType || !Object.hasOwn(MIME_EXTENSIONS, baseMimeType)) {
    return { ok: false, error: `unsupported mimeType '${String(mimeType)}'` }
  }

  const {
    recordingsDir = join(DATA_DIR, 'staging', 'recordings', VARIETY),
    writeFile = (path, bytes) => writeFileSync(path, bytes),
    idSuffix = () => randomUUID(),
    stagingDir,
  } = deps

  const ext = MIME_EXTENSIONS[baseMimeType]!
  const filename = `${slugify(pengim)}__${slugify(speaker)}__${idSuffix()}${ext}`
  const absPath = join(recordingsDir, filename)
  const localPath = relative(ROOT, absPath)

  mkdirSync(recordingsDir, { recursive: true })
  const bytes = Buffer.from(audioBase64, 'base64')
  writeFile(absPath, bytes)

  const proposal: LocalRecordingProposal = {
    pengim,
    syllableCount: 1,
    localPath,
    speaker,
    recordedDate,
    consentAcknowledged: true,
    variety: VARIETY,
  }
  appendLocalRecordingProposal(proposal, stagingDir)

  return { ok: true, localPath }
}
