import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GITHUB_REPO } from '../schema/phonology.js'
import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import type { AudioClipProposal } from './audio-types.js'

/**
 * Re-hosts one staged Lingua Libre proposal's bytes as a GitHub Release
 * asset (data/phonology/REVIEW.md § 16) — downloads from Commons, checksums,
 * uploads via `gh release upload`, and returns the `url`/`checksum` pair
 * ready to paste into a `data/phonology/audio/<variety>.yaml` clip entry.
 *
 * Deliberately per-clip, not a bulk operation: re-hosting is only worth
 * doing once a human has decided a clip is worth keeping (right
 * variety/accent, transcription matches a real entry) — see REVIEW.md §
 * 16's "explicitly out of scope" note. Driven by `src/cli/lingualibre-
 * rehost.ts`; kept separate from that thin CLI script (a bare top-level
 * script body, like every other file under src/cli/) so this logic stays
 * importable and unit-testable.
 */

export const DEFAULT_REHOST_TAG = 'audio-lingualibre'

/** Resolves a CLI arg to a staged proposal: a numeric index, or an exact `commonsTitle` match. */
export function resolveProposal(arg: string, proposals: AudioClipProposal[]): AudioClipProposal | undefined {
  const asIndex = Number(arg)
  if (Number.isInteger(asIndex) && String(asIndex) === arg) return proposals[asIndex]
  return proposals.find((p) => p.commonsTitle === arg)
}

/**
 * A plain-ASCII, hyphenated asset filename for `key`, keeping whatever
 * extension `sourcePathOrUrl` ends in (falling back to `.wav`). Shared by
 * `assetFilename` below and `local-recording-rehost.ts`'s equivalent, which
 * derives a filename from a local file path rather than a Commons URL.
 */
export function slugAssetFilename(key: string, sourcePathOrUrl: string): string {
  const ext = sourcePathOrUrl.match(/\.[a-zA-Z0-9]+$/u)?.[0]?.toLowerCase() ?? '.wav'
  const slug = key.trim().toLowerCase().replace(/\s+/gu, '-')
  return `${slug}${ext}`
}

/** A plain-ASCII, hyphenated asset filename derived from the proposal's pengim key, keeping the source's own extension. */
export function assetFilename(proposal: AudioClipProposal): string {
  return slugAssetFilename(proposal.pengim, proposal.commonsUrl)
}

/**
 * Unlike the Commons API calls in lingualibre.ts, this hits
 * upload.wikimedia.org directly for the clip bytes themselves — the actual
 * bulk transfer, and previously the one path in this importer with no 429
 * handling at all. Routed through fetchWithRetry for the same reason those
 * calls are: Wikimedia's edge limiter applies here too, not just to api.php.
 */
async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function defaultReleaseExists(tag: string): boolean {
  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function defaultRunGh(args: string[]): void {
  execFileSync('gh', args, { stdio: 'inherit' })
}

function ensureRelease(
  tag: string,
  releaseExists: (tag: string) => boolean,
  runGh: (args: string[]) => void,
  notes: string,
): void {
  if (releaseExists(tag)) return
  runGh(['release', 'create', tag, '--title', tag, '--notes', notes])
}

export interface UploadBytesOptions {
  tag: string
  /** Passed to `gh release create` the first time `tag` is used — callers own their own wording. */
  releaseNotes: string
  /** Injectable for tests — avoids shelling out to a real `gh release view`. */
  releaseExists?: (tag: string) => boolean
  /** Injectable for tests — avoids shelling out to a real `gh`. */
  runGh?: (args: string[]) => void
  tmpDir?: string
}

export interface UploadBytesResult {
  url: string
  checksum: string
}

/**
 * The re-host mechanics shared by every clip source regardless of where its
 * bytes came from: checksum, write to a tmp file, `gh release upload`, clean
 * up. Factored out of `rehostClip` (issue #128, `data/phonology/REVIEW.md` §
 * 17) so a locally-recorded clip — which has no URL to fetch, only bytes
 * already in hand — can reuse this instead of duplicating the tmpdir/`gh`/
 * checksum dance.
 */
export async function uploadBytesToRelease(
  bytes: Buffer,
  filename: string,
  options: UploadBytesOptions,
): Promise<UploadBytesResult> {
  const {
    tag,
    releaseNotes,
    releaseExists = defaultReleaseExists,
    runGh = defaultRunGh,
    tmpDir = mkdtempSync(join(tmpdir(), 'rehost-')),
  } = options

  ensureRelease(tag, releaseExists, runGh, releaseNotes)

  const localPath = join(tmpDir, filename)
  writeFileSync(localPath, bytes)

  try {
    // --clobber: a re-run against the same proposal (or a --force re-merge,
    // see mergeLinguaLibreClip/mergeLocalRecording) re-uploads to this same
    // deterministic filename — without it `gh` refuses the asset-name
    // collision.
    runGh(['release', 'upload', tag, localPath, '--clobber'])
  } finally {
    rmSync(localPath, { force: true })
  }

  const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const url = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
  return { url, checksum }
}

export interface RehostOptions {
  tag?: string
  /** Injectable for tests — avoids a real network call. */
  fetchBytes?: (url: string) => Promise<Buffer>
  /** Injectable for tests — avoids shelling out to a real `gh release view`. */
  releaseExists?: (tag: string) => boolean
  /** Injectable for tests — avoids shelling out to a real `gh`. */
  runGh?: (args: string[]) => void
  tmpDir?: string
}

export interface RehostResult {
  proposal: AudioClipProposal
  url: string
  checksum: string
}

export async function rehostClip(proposal: AudioClipProposal, options: RehostOptions = {}): Promise<RehostResult> {
  const { tag = DEFAULT_REHOST_TAG, fetchBytes = defaultFetchBytes, ...uploadOptions } = options

  const bytes = await fetchBytes(proposal.commonsUrl)
  const filename = assetFilename(proposal)
  const { url, checksum } = await uploadBytesToRelease(bytes, filename, {
    ...uploadOptions,
    tag,
    releaseNotes: 'Re-hosted Lingua Libre/Commons audio clips — see data/phonology/REVIEW.md § 16.',
  })

  return { proposal, url, checksum }
}
