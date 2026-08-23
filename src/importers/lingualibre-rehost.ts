import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GITHUB_REPO } from '../schema/phonology.js'
import { IMPORTER_USER_AGENT } from './types.js'
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

/** A plain-ASCII, hyphenated asset filename derived from the proposal's pengim key, keeping the source's own extension. */
export function assetFilename(proposal: AudioClipProposal): string {
  const ext = proposal.commonsUrl.match(/\.[a-zA-Z0-9]+$/u)?.[0]?.toLowerCase() ?? '.wav'
  const slug = proposal.pengim.trim().toLowerCase().replace(/\s+/gu, '-')
  return `${slug}${ext}`
}

async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } })
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

function ensureRelease(tag: string, releaseExists: (tag: string) => boolean, runGh: (args: string[]) => void): void {
  if (releaseExists(tag)) return
  runGh([
    'release',
    'create',
    tag,
    '--title',
    tag,
    '--notes',
    'Re-hosted Lingua Libre/Commons audio clips — see data/phonology/REVIEW.md § 16.',
  ])
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
  const {
    tag = DEFAULT_REHOST_TAG,
    fetchBytes = defaultFetchBytes,
    releaseExists = defaultReleaseExists,
    runGh = defaultRunGh,
    tmpDir = mkdtempSync(join(tmpdir(), 'lingualibre-rehost-')),
  } = options

  ensureRelease(tag, releaseExists, runGh)

  const bytes = await fetchBytes(proposal.commonsUrl)
  const filename = assetFilename(proposal)
  const localPath = join(tmpDir, filename)
  writeFileSync(localPath, bytes)

  try {
    // --clobber: a re-run against the same proposal (or a --force re-merge,
    // see mergeLinguaLibreClip) re-uploads to this same deterministic
    // filename — without it `gh` refuses the asset-name collision.
    runGh(['release', 'upload', tag, localPath, '--clobber'])
  } finally {
    rmSync(localPath, { force: true })
  }

  const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const url = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${filename}`
  return { proposal, url, checksum }
}
