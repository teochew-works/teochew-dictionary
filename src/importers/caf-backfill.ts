import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseDocument } from 'yaml'

import type { Audio, AudioClip } from '@teochew/core'
import { fetchWithRetry, IMPORTER_USER_AGENT } from './types.js'
import { uploadBytesToRelease, type UploadBytesOptions } from './lingualibre-rehost.js'
import { encodeCaf, type EncodeCafOptions } from './caf-encode.js'

/**
 * Backfills `cafUrl`/`cafChecksum` (issue #228) onto every already-merged
 * `.webm` clip in one variety's audio manifest that doesn't have one yet:
 * downloads the clip, transcodes it via `encodeCaf`, re-hosts the result as a
 * GitHub Release asset, and writes the new fields back with
 * `parseDocument`/`setIn` (ADR-0018: these are structurally-regular,
 * comment-bearing manifests, not hand-tuned entry files, so mutate-in-place
 * is the right technique here, not byte-offset splicing).
 *
 * CAF assets go into their *own* dedicated release(s) (`audio-<variety>-caf`,
 * rolling over to `-caf-2`, `-caf-3`, ... — see `nextCafReleaseTag`), never
 * the source clip's own release: GitHub caps a release at 1000 assets, several
 * of the existing per-variety `.webm` releases are already at or near that cap
 * (confirmed the hard way — issue #228), and doubling their asset count with
 * CAF siblings would just hit the same wall immediately.
 *
 * Dry-run by default, `--write` to commit (mirrors the `backfill:*` family) —
 * and, per that same family's rule, only ever fills an absent field: a clip
 * that already has `cafUrl` is left untouched, and a clip whose `url` isn't
 * `.webm` (e.g. today's `.wav` clips) is skipped as needing no alternate.
 *
 * A dry run still fetches and transcodes every pending clip — the point is to
 * prove the pipeline against real data before committing to it — but stops
 * short of the `gh release upload` and the file write, both gated on `write`.
 */

export type Bucket = 'clips' | 'wordClips'

/** GitHub's own per-release asset limit (confirmed by a real 422: "file_count limited to 1000 assets per release"). */
export const GITHUB_RELEASE_ASSET_CAP = 1000

export interface BackfillCafOpusOptions extends EncodeCafOptions {
  write?: boolean
  /** Injectable for tests — avoids a real network fetch of the source clip. */
  fetchBytes?: (url: string) => Promise<Buffer>
  /** Injectable for tests — avoids shelling out to a real `gh release view`. */
  releaseExists?: UploadBytesOptions['releaseExists']
  /** Injectable for tests — avoids shelling out to a real `gh`. */
  runGh?: UploadBytesOptions['runGh']
  /**
   * Injectable for tests — avoids shelling out to a real `gh release view`.
   * Returns the release's current asset count, or `null` if it doesn't exist
   * yet (in which case it's created, with room to spare, on first upload).
   */
  getAssetCount?: (tag: string) => number | null
}

export interface BackfilledClip {
  bucket: Bucket
  key: string
  index: number
  cafUrl: string
}

export interface BackfillCafOpusResult {
  scanned: number
  skippedHasCaf: number
  skippedNotWebm: number
  backfilled: BackfilledClip[]
}

async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetchWithRetry(url, { headers: { 'user-agent': IMPORTER_USER_AGENT } })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function defaultGetAssetCount(tag: string): number | null {
  try {
    const out = execFileSync('gh', ['release', 'view', tag, '--json', 'assets', '--jq', '.assets | length'], {
      encoding: 'utf8',
    })
    return Number(out.trim())
  } catch {
    return null
  }
}

/** The release tag a stored clip URL was uploaded into, parsed back out of `.../releases/download/<tag>/<asset>`. */
export function tagFromClipUrl(url: string): string {
  const match = url.match(/\/releases\/download\/([^/]+)\//u)
  if (!match) throw new Error(`not a GitHub Release asset URL: ${url}`)
  return match[1]!
}

/**
 * A `.caf` asset filename for a `.webm` clip URL, prefixed with the source's
 * own release tag (e.g. `audio-teochew-dictionary-audio-4-du2.caf`). Every
 * CAF upload for a variety lands in one shared release regardless of which
 * numbered `.webm` release its source came from, so the tag prefix is what
 * keeps filenames unique — the same pengim key (a repeat speaker, issue #134)
 * can otherwise recur across different source releases.
 */
function cafFilenameFor(url: string): string {
  const tag = tagFromClipUrl(url)
  const basename = url.split('/').pop()!.replace(/\.webm$/iu, '')
  return `${tag}-${basename}.caf`
}

function needsCaf(clip: AudioClip): boolean {
  return clip.cafUrl === undefined && /\.webm$/iu.test(clip.url)
}

const BUCKETS: Bucket[] = ['clips', 'wordClips']

/**
 * Allocates the CAF release tag to upload the next asset into, for one
 * variety: starts at `audio-<variety>-caf`, checking its current asset count
 * once up front, and only rolls over to `-caf-2`, `-caf-3`, ... (re-checking
 * each new tag's own count) once the running total would meet
 * `GITHUB_RELEASE_ASSET_CAP` — so a long backfill run costs one `gh release
 * view` call per release actually filled, not one per clip.
 */
function createCafTagAllocator(variety: string, getAssetCount: (tag: string) => number | null) {
  const base = `audio-${variety}-caf`
  let suffix = 1
  let tag = base
  let count = getAssetCount(tag) ?? 0

  function tagFor(n: number): string {
    return n === 1 ? base : `${base}-${n}`
  }

  return {
    nextTag(): string {
      while (count >= GITHUB_RELEASE_ASSET_CAP) {
        suffix += 1
        tag = tagFor(suffix)
        count = getAssetCount(tag) ?? 0
      }
      return tag
    },
    recordUpload(): void {
      count += 1
    },
  }
}

/**
 * Runs the backfill over one already-loaded variety's `Audio` table, writing
 * the result into `path` (its own YAML manifest) when `write` is set.
 */
export async function backfillCafOpus(
  path: string,
  audio: Audio,
  options: BackfillCafOpusOptions = {},
): Promise<BackfillCafOpusResult> {
  const {
    write = false,
    fetchBytes = defaultFetchBytes,
    releaseExists,
    runGh,
    getAssetCount = defaultGetAssetCount,
    ...encodeOptions
  } = options

  if (write && !existsSync(path)) {
    throw new Error(`cannot write — no such file: ${path}`)
  }

  const result: BackfillCafOpusResult = { scanned: 0, skippedHasCaf: 0, skippedNotWebm: 0, backfilled: [] }
  const doc = write ? parseDocument(readFileSync(path, 'utf8')) : null
  const cafTags = createCafTagAllocator(audio.audio.variety, getAssetCount)

  for (const bucket of BUCKETS) {
    const table = audio[bucket] ?? {}
    for (const [key, clips] of Object.entries(table)) {
      for (const [index, clip] of clips.entries()) {
        result.scanned += 1

        if (clip.cafUrl !== undefined) {
          result.skippedHasCaf += 1
          continue
        }
        if (!needsCaf(clip)) {
          result.skippedNotWebm += 1
          continue
        }

        const webmBytes = await fetchBytes(clip.url)
        const cafBytes = encodeCaf(webmBytes, encodeOptions)

        if (!write) {
          result.backfilled.push({ bucket, key, index, cafUrl: '(dry run, not uploaded)' })
          continue
        }

        const { url: cafUrl, checksum: cafChecksum } = await uploadBytesToRelease(cafBytes, cafFilenameFor(clip.url), {
          tag: cafTags.nextTag(),
          releaseNotes: 'CAF/Opus alternates for iOS-native playback (issue #228).',
          releaseExists,
          runGh,
        })
        cafTags.recordUpload()

        doc!.setIn([bucket, key, index, 'cafUrl'], cafUrl)
        doc!.setIn([bucket, key, index, 'cafChecksum'], cafChecksum)
        result.backfilled.push({ bucket, key, index, cafUrl })

        // Written after every clip, not just once at the end: a run over a
        // large corpus is thousands of real uploads, and an interruption
        // partway through (network blip, one bad clip, Ctrl+C) must not lose
        // the record of everything already uploaded — `needsCaf` above makes
        // a re-run naturally resume from wherever this left off.
        writeFileSync(path, doc!.toString())
      }
    }
  }

  return result
}
