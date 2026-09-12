import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Audio, AudioClip } from '@teochew/core'
import { IMPORTER_USER_AGENT, fetchWithRetry } from '../importers/types.js'
import { AUDIO_CLIP_CACHE_DIR } from '../paths.js'

/**
 * A local copy of every published clip, keyed by the manifest's own checksum
 * (issue #259). `data/phonology/audio/*.yaml` holds only URLs and checksums
 * (ADR-0014) — the bytes live on GitHub Releases — so anything that needs to
 * *listen* to the corpus (grading, synthesis) first needs them on disk.
 *
 * Keyed by sha256 rather than by syllable so the cache is immune to a clip
 * being re-recorded under the same key: the new checksum is simply a new
 * file, and the old one is harmless dead weight until the operator clears it.
 * A cached file is trusted only if its bytes hash to its own name — a
 * truncated download from an interrupted run is re-fetched, not reused.
 */

/** Bare sha256 hex — the manifest's `sha256:` prefix stripped, lowercased. */
export function checksumHex(checksum: string): string {
  return checksum.replace(/^sha256:/u, '').toLowerCase()
}

export function clipCachePath(checksum: string, cacheDir: string = AUDIO_CLIP_CACHE_DIR): string {
  return join(cacheDir, `${checksumHex(checksum)}.webm`)
}

/** One manifest clip with the path it is reported under (`clips.du2[0]`). */
export interface ManifestClip {
  key: string
  index: number
  path: string
  clip: AudioClip
}

/**
 * Every syllable clip in one variety's table, in manifest order. `wordClips`
 * are deliberately excluded: the per-part statistics in ../audio/grade.ts
 * are about single syllables, and a whole-word recording has no single tone
 * or onset to file under.
 */
export function manifestClips(audio: Audio): ManifestClip[] {
  return Object.entries(audio.clips).flatMap(([key, clips]) =>
    clips.map((clip, index) => ({ key, index, path: `clips.${key}[${index}]`, clip })),
  )
}

const FETCH_TIMEOUT_MS = 30_000

async function fetchClipDefault(url: string): Promise<Response> {
  return fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } }, { timeoutMs: FETCH_TIMEOUT_MS })
}

export interface EnsureCachedOptions {
  cacheDir?: string
  /** Injectable for tests and offline runs — avoids real network calls. */
  fetchClip?: (url: string) => Promise<Response>
}

export type EnsureCachedResult =
  | { ok: true; path: string; fetched: boolean }
  | { ok: false; error: string }

function isIntact(path: string, checksum: string): boolean {
  if (!existsSync(path)) return false
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  return digest === checksumHex(checksum)
}

/**
 * The on-disk path for `clip`, fetching it first if it isn't cached intact.
 * A downloaded body that fails its checksum is not written — the manifest's
 * checksum is the clip's only integrity check (ADR-0014), and a cache is the
 * wrong place to launder a mismatch that `audio:verify` exists to report.
 */
export async function ensureClipCached(clip: AudioClip, options: EnsureCachedOptions = {}): Promise<EnsureCachedResult> {
  const { cacheDir = AUDIO_CLIP_CACHE_DIR, fetchClip = fetchClipDefault } = options
  const path = clipCachePath(clip.checksum, cacheDir)
  if (isIntact(path, clip.checksum)) return { ok: true, path, fetched: false }

  let body: Buffer
  try {
    const res = await fetchClip(clip.url)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} fetching ${clip.url}` }
    body = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return { ok: false, error: `failed to fetch ${clip.url}: ${e instanceof Error ? e.message : String(e)}` }
  }

  const digest = createHash('sha256').update(body).digest('hex')
  if (digest !== checksumHex(clip.checksum)) {
    return { ok: false, error: `checksum mismatch for ${clip.url}: expected ${checksumHex(clip.checksum)}, got ${digest}` }
  }

  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(path, body)
  return { ok: true, path, fetched: true }
}
