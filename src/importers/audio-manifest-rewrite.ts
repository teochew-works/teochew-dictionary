import { readFileSync, writeFileSync } from 'node:fs'
import { parseDocument } from 'yaml'

import type { Audio } from '@teochew/core'
import { expectedS3KeyFor, mirrorTargets, type MirrorTarget } from './audio-mirror.js'
import { AUDIO_CDN_BASE } from './s3-upload.js'

/**
 * Rewrites one variety's audio manifest so `url`/`cafUrl` point at the
 * CloudFront mirror instead of GitHub Releases (issue #270 step 4) — the
 * final step of the migration, gated on the `packages/core` release and
 * mobile-app pin landing first (ADR-0026): an app still validating against
 * the old core version would reject every rewritten URL outright.
 *
 * Only ever rewrites a target whose CloudFront object is confirmed present
 * (a HEAD request against the exact key `mirrorAudioToS3` would use —
 * `expectedS3KeyFor`, the same derivation `audio-reclaim.ts` treats as
 * "still referenced"). A clip added to the manifest after the corpus
 * mirror ran (issue #270 step 3) has nothing at its CloudFront key yet, and
 * citing that key anyway would silently break playback for exactly that
 * clip — such a target is left pointing at GitHub and reported in
 * `notYetMirrored`, not silently skipped.
 *
 * Mutates via `yaml`'s comment-preserving `parseDocument`/`setIn`
 * (ADR-0018: this manifest is structurally-regular and comment-bearing,
 * not a hand-tuned entry file — see caf-backfill.ts for the same
 * technique), never parse→stringify. Dry-run by default (still issues the
 * HEAD checks, to prove every target is actually ready before committing
 * to anything, but writes nothing); `--write` to commit.
 */

export interface RewriteTarget extends MirrorTarget {
  newUrl: string
}

/** A target whose HEAD check itself raised — a timeout or a genuine network error, not "confirmed absent" the way `notYetMirrored` is. */
export interface RewriteFailure extends RewriteTarget {
  error: string
}

export interface RewriteOptions {
  write?: boolean
  /** Injectable for tests — avoids a real network HEAD request. */
  checkExists?: (url: string) => Promise<boolean>
}

export interface RewriteResult {
  scanned: number
  rewritten: RewriteTarget[]
  notYetMirrored: RewriteTarget[]
  failed: RewriteFailure[]
}

/**
 * A bare `fetch` with no signal attaches no `AbortSignal` and so can hang
 * forever on a stalled connection instead of failing and letting the caller
 * move on — confirmed the hard way against `fetchWithRetry` in
 * audio-mirror.ts/caf-backfill.ts (issue #270: a 38-minute hang on the very
 * first target). CloudFront answers a HEAD in well under a second normally;
 * 10s is generous for that and short enough that a real stall fails fast.
 */
const HEAD_TIMEOUT_MS = 10_000

async function defaultCheckExists(url: string): Promise<boolean> {
  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(HEAD_TIMEOUT_MS) })
  return res.ok
}

/** The CloudFront URL `target`'s clip should be rewritten to — the same key `mirrorAudioToS3` uploaded (or would upload) it under. */
export function expectedCloudFrontUrl(audio: Audio, target: MirrorTarget): string {
  return `${AUDIO_CDN_BASE}/${expectedS3KeyFor(audio, target)}`
}

/**
 * Runs the rewrite over one already-loaded variety's `Audio` table, writing
 * the result into `path` (its own YAML manifest) when `write` is set.
 */
export async function rewriteManifestToS3(
  path: string,
  audio: Audio,
  options: RewriteOptions = {},
): Promise<RewriteResult> {
  const { write = false, checkExists = defaultCheckExists } = options

  const result: RewriteResult = { scanned: 0, rewritten: [], notYetMirrored: [], failed: [] }
  const doc = write ? parseDocument(readFileSync(path, 'utf8')) : null

  for (const target of mirrorTargets(audio)) {
    result.scanned += 1
    const newUrl = expectedCloudFrontUrl(audio, target)

    // Isolated per target — a single timeout or network error must not
    // discard every target already scanned before it and abort the whole
    // variety, the same lesson audio-mirror.ts's `failed` learned the hard
    // way (issue #270).
    let exists: boolean
    try {
      exists = await checkExists(newUrl)
    } catch (e) {
      result.failed.push({ ...target, newUrl, error: e instanceof Error ? e.message : String(e) })
      continue
    }

    if (!exists) {
      result.notYetMirrored.push({ ...target, newUrl })
      continue
    }

    result.rewritten.push({ ...target, newUrl })

    if (write) {
      doc!.setIn([target.bucket, target.pengimKey, target.index, target.field], newUrl)
      // Written after every clip, not just once at the end — mirrors
      // caf-backfill.ts's own resumability reasoning: an interruption
      // partway through must not lose the record of everything already
      // rewritten.
      writeFileSync(path, doc!.toString())
    }
  }

  return result
}
