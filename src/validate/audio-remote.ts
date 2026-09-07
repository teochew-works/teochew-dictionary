import { createHash } from 'node:crypto'

import { IMPORTER_USER_AGENT, fetchWithRetry } from '../importers/types.js'
import type { Audio, AudioClip } from '@teochew/core'
import type { Issue } from './index.js'

/**
 * Network-touching companion to `checkAudio` (issue #35): actually fetches
 * every published asset and verifies its checksum, which `checkAudio` itself
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

/**
 * One published asset to fetch and checksum. A clip is *not* one unit of work:
 * since issue #228 a clip may carry a CAF/Opus alternate alongside its WebM
 * original, and each is a separately uploaded Release asset that can rot
 * independently of the other.
 *
 * Two paths rather than one because a fetch failure and a checksum mismatch
 * point at different fields — `clips.dio5[0]` vs `clips.dio5[0].checksum` for
 * the original, `clips.dio5[0].cafUrl` vs `clips.dio5[0].cafChecksum` for the
 * alternate — so an issue names the field a reader would actually go and look at.
 */
interface VerifyTarget {
  file: string
  /** Reported for a fetch failure. */
  path: string
  /** Reported for a checksum mismatch. */
  checksumPath: string
  url: string
  checksum: string
}

/**
 * Flattens loaded varieties into the assets to verify, one per URL.
 *
 * Exported so `src/cli/audio-verify.ts` can size its progress meter off the
 * same walk that does the work — it previously re-derived a count by walking
 * `clips`/`wordClips` itself, which quietly stopped matching once a clip could
 * mean more than one fetch.
 *
 * `cafUrl`/`cafChecksum` are paired by a schema refine, so the guard below can
 * never reject a valid manifest; it is there to satisfy the type, not to paper
 * over a real half-populated case.
 */
export function audioVerifyTargets(sources: AudioSource[]): VerifyTarget[] {
  return sources.flatMap(({ file, audio }) =>
    clipEntries(audio).flatMap(([path, clip]): VerifyTarget[] => {
      const targets: VerifyTarget[] = [
        { file, path, checksumPath: `${path}.checksum`, url: clip.url, checksum: clip.checksum },
      ]
      if (clip.cafUrl !== undefined && clip.cafChecksum !== undefined) {
        targets.push({
          file,
          path: `${path}.cafUrl`,
          checksumPath: `${path}.cafChecksum`,
          url: clip.cafUrl,
          checksum: clip.cafChecksum,
        })
      }
      return targets
    }),
  )
}

const FETCH_TIMEOUT_MS = 30_000

/**
 * Goes through `fetchWithRetry` rather than bare `fetch` so a rate-limited
 * response backs off and retries instead of being recorded as a dead asset.
 * Without it a single 429 is indistinguishable in the report from a genuinely
 * missing or corrupted clip — and this command makes thousands of requests to
 * one host in a tight serial loop, which is exactly the shape that trips a
 * rate limiter. `timeoutMs` keeps the existing per-attempt deadline.
 */
async function fetchClipDefault(url: string): Promise<Response> {
  return fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } }, { timeoutMs: FETCH_TIMEOUT_MS })
}

export interface AudioRemoteOptions {
  /** Injectable for tests and offline runs — avoids real network calls. */
  fetchClip?: (url: string) => Promise<Response>
  /**
   * Called once per *asset* after it's checked (however it resolved), with the
   * running count and the total — the corpus is thousands of assets and each
   * one is a real network fetch, so a long run would otherwise print nothing
   * at all until it finishes. Optional: existing callers/tests that don't
   * care about progress just omit it.
   *
   * Per asset, not per clip: a clip with a CAF alternate is two fetches, and
   * counting it once would make the meter stall for a beat on every clip.
   */
  onProgress?: (done: number, total: number) => void
}

export async function verifyAudioRemote(sources: AudioSource[], options: AudioRemoteOptions = {}): Promise<Issue[]> {
  const { fetchClip = fetchClipDefault, onProgress } = options
  const issues: Issue[] = []

  const targets = audioVerifyTargets(sources)

  let done = 0
  for (const { file, path, checksumPath, url, checksum } of targets) {
    let body: Buffer
    try {
      const res = await fetchClip(url)
      if (!res.ok) {
        issues.push(err(file, `HTTP ${res.status} fetching ${url}`, path))
        done += 1
        onProgress?.(done, targets.length)
        continue
      }
      body = Buffer.from(await res.arrayBuffer())
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      issues.push(err(file, `failed to fetch ${url}: ${message}`, path))
      done += 1
      onProgress?.(done, targets.length)
      continue
    }

    const digest = createHash('sha256').update(body).digest('hex')
    const expected = checksum.replace(/^sha256:/u, '').toLowerCase()

    if (digest !== expected) {
      issues.push(err(file, `checksum mismatch for ${url}: expected ${expected}, got ${digest}`, checksumPath))
    }

    done += 1
    onProgress?.(done, targets.length)
  }

  return issues
}
