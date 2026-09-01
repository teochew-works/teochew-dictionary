import { createHash } from 'node:crypto'

import { IMPORTER_USER_AGENT } from '../importers/types.js'
import type { Audio, AudioClip } from '@teochew/core'
import type { Issue } from './index.js'

/**
 * Network-touching companion to `checkAudio` (issue #35): actually fetches
 * every clip's `url` and verifies its `checksum`, which `checkAudio` itself
 * deliberately does not do (see its doc comment) since the clip's bytes live
 * on GitHub Releases, not in this repo.
 *
 * Kept out of `checkAudio`/`validate()` entirely so `npm run check` stays
 * offline — this is invoked only via `npm run audio:verify`, the same way
 * `npm run xref`/`npm run import` are network-touching commands excluded
 * from `check`.
 *
 * Takes already-loaded `Audio` tables rather than reading `data/phonology/
 * audio/` itself, the same way `checkAudio` takes an already-loaded `Audio`
 * — keeps this pure and directly testable against fixtures. The CLI wrapper
 * (`src/cli/audio-verify.ts`) does the loading via `listAudioVarieties`/
 * `loadAudio`.
 */

/** One variety's audio metadata, with the filename it was loaded from. */
export interface AudioSource {
  file: string
  audio: Audio
}

function err(file: string, message: string, path: string): Issue {
  return { level: 'error', file, message, path }
}

/**
 * Every clip in one variety's table, keyed by its `path` for issue reporting:
 * `clips` and `wordClips` alike. `wordClips` (issue #106) carries exactly the
 * same `url`/`checksum` pair as `clips`, and the checksum is the only
 * integrity check either has — the bytes live on GitHub Releases, not in this
 * repo (data/phonology/REVIEW.md § 12) — so leaving word clips out verified
 * nothing while still reporting success.
 */
function clipEntries(audio: Audio): [string, AudioClip][] {
  return [
    ...Object.entries(audio.clips).flatMap(([key, clips]): [string, AudioClip][] =>
      clips.map((clip, i) => [`clips.${key}[${i}]`, clip]),
    ),
    ...Object.entries(audio.wordClips ?? {}).flatMap(([key, clips]): [string, AudioClip][] =>
      clips.map((clip, i) => [`wordClips.${key}[${i}]`, clip]),
    ),
  ]
}

const FETCH_TIMEOUT_MS = 30_000

async function fetchClipDefault(url: string): Promise<Response> {
  return fetch(url, { headers: { 'user-agent': IMPORTER_USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

export interface AudioRemoteOptions {
  /** Injectable for tests and offline runs — avoids real network calls. */
  fetchClip?: (url: string) => Promise<Response>
}

export async function verifyAudioRemote(sources: AudioSource[], options: AudioRemoteOptions = {}): Promise<Issue[]> {
  const { fetchClip = fetchClipDefault } = options
  const issues: Issue[] = []

  for (const { file, audio } of sources) {
    for (const [path, clip] of clipEntries(audio)) {

      let body: Buffer
      try {
        const res = await fetchClip(clip.url)
        if (!res.ok) {
          issues.push(err(file, `HTTP ${res.status} fetching ${clip.url}`, path))
          continue
        }
        body = Buffer.from(await res.arrayBuffer())
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        issues.push(err(file, `failed to fetch ${clip.url}: ${message}`, path))
        continue
      }

      const digest = createHash('sha256').update(body).digest('hex')
      const expected = clip.checksum.replace(/^sha256:/u, '').toLowerCase()

      if (digest !== expected) {
        issues.push(
          err(file, `checksum mismatch for ${clip.url}: expected ${expected}, got ${digest}`, `${path}.checksum`),
        )
      }
    }
  }

  return issues
}
