import type { Document } from 'yaml'

import type { AudioClip } from '@teochew/core'
import { isPrimary } from '../audio/primary.js'

/**
 * The append-a-take half of ADR-0029 (issue #290), shared verbatim by
 * `mergeLocalRecording` (./local-recording-merge.js) and
 * `mergeLinguaLibreClip` (./lingualibre-merge.js) so the two importers cannot
 * drift: a contributor who stages several takes of one syllable must get the
 * same numbering, the same primary designation and the same idempotence
 * whichever source the bytes came from.
 *
 * The rule, in one sentence: **identity is the checksum, `speaker` is the
 * identity of a person only.** What follows from it is the three dispositions
 * below, and the reason `--force` is gone from both merges — there is nothing
 * left for it to overwrite, because the same bytes are a no-op and different
 * bytes get their own immutable `-take<N>` asset path.
 *
 * Deliberately split into a pure `planTakeMerge` and two appliers: the
 * decision is the part worth testing exhaustively (gapped take numbers, a
 * `-n` render sitting at the key, an existing explicit primary), and it should
 * be testable without a YAML document or an S3 stub in the way.
 */

/**
 * What a merge did:
 *
 * - `already-merged` — these exact bytes are already published at this key, by
 *   this speaker or another. Nothing is uploaded and nothing is written; a
 *   re-run of a merge that already succeeded lands here and exits 0.
 * - `appended-first` — this speaker's first clip at this key. Appended with no
 *   `take` and no `primary`: it is implicitly primary, and its asset path is
 *   the plain `<speaker>/<key>.<ext>` every pre-ADR-0029 clip already uses.
 * - `appended-take` — this speaker already has a clip here, so the new one is
 *   `take: N+1` at its own `-take<N>` path.
 */
export type TakeDisposition = 'already-merged' | 'appended-first' | 'appended-take'

export interface TakeMergePlan {
  disposition: TakeDisposition
  /** Index at this key of the clip that already holds these bytes — `already-merged` only. */
  existingIndex?: number
  /** The new clip's take number. 1 means "write no `take` field" — a speaker's first take at this key. */
  take: number
  /** Whether the new clip is written with `primary: true`. */
  primary: boolean
  /** Index of an existing clip that must gain `primary: true` in place, so a group that just grew past one is explicit. */
  setPrimaryAt?: number
  /** Indices of existing clips whose `primary` marker must be deleted — `--primary` moving the designation to the new take. */
  clearPrimaryAt: number[]
}

export interface TakeMergeInput {
  /** The speaker id the new clip will carry — already resolved by the caller. */
  speaker: string
  /** The sha256 of the bytes about to be published. Hashed *before* the upload, because it is what decides whether to upload at all. */
  checksum: string
  /** Designate the new take as the one this speaker publishes, moving the marker off whichever take holds it. */
  primary?: boolean
}

/** `take` is absent on a speaker's first take at a key (ADR-0029) — the same convention `src/validate/index.ts` reads. */
function takeNumber(clip: AudioClip): number {
  return clip.take ?? 1
}

/**
 * Decides what merging `input`'s bytes into `existing` (every clip already at
 * this `clips`/`wordClips` key) should do. Pure: no I/O, no upload, no YAML.
 *
 * `synthesis` renders are excluded from the speaker's group even when they
 * share its id prefix — an ADR-0027 `<speaker>-n` render is a derived tier
 * under its *own* speaker id, so it is never in this speaker's group anyway,
 * and the exclusion is defence against a hand-edit that files one under the
 * recording speaker. It matches `isPrimary` (../audio/primary.js), which the
 * validator uses over the same clips.
 */
export function planTakeMerge(existing: readonly AudioClip[], input: TakeMergeInput): TakeMergePlan {
  const existingIndex = existing.findIndex((c) => c.checksum === input.checksum)
  if (existingIndex !== -1) {
    const clip = existing[existingIndex]!
    // `isPrimary`, not `clip.primary === true`: the clip these bytes are
    // already published as may well be a lone, implicitly-primary one, and
    // reporting it as non-primary would tell a re-running human the opposite
    // of what the manifest means.
    return {
      disposition: 'already-merged',
      existingIndex,
      take: takeNumber(clip),
      primary: isPrimary(clip, existing),
      clearPrimaryAt: [],
    }
  }

  const group = existing
    .map((clip, index) => ({ clip, index }))
    .filter(({ clip }) => clip.synthesis === undefined && clip.speaker === input.speaker)

  if (group.length === 0) {
    // Today's behaviour, unchanged: no `take`, no `primary`, today's asset
    // path. Requesting `primary` here is not an error — a lone clip already is
    // primary — it just needs no marker to say so.
    return { disposition: 'appended-first', take: 1, primary: false, clearPrimaryAt: [] }
  }

  // Max + 1, never "count + 1": takes are part of an immutable asset path and
  // are never renumbered, so a deleted take 2 leaves a gap that the next merge
  // must step over rather than reuse.
  const take = Math.max(...group.map(({ clip }) => takeNumber(clip))) + 1

  if (input.primary === true) {
    return {
      disposition: 'appended-take',
      take,
      primary: true,
      clearPrimaryAt: group.filter(({ clip }) => clip.primary === true).map(({ index }) => index),
    }
  }

  // The default, and #288's case: the new take is training-only and what a
  // learner hears does not change. The group has just grown past one clip, so
  // the validator now demands an explicit primary — splice it into the clip
  // that was until now implicitly primary. A group that already names one is
  // left exactly as it is.
  const alreadyMarked = group.some(({ clip }) => clip.primary === true)
  return {
    disposition: 'appended-take',
    take,
    primary: false,
    ...(alreadyMarked ? {} : { setPrimaryAt: group[0]!.index }),
    clearPrimaryAt: [],
  }
}

/**
 * `plan` applied to a plain list of clips — the shape the merges hand to
 * `audioSchema.parse` to prove the result is valid before writing anything,
 * and what a brand-new variety file is stringified from.
 */
export function applyTakePlanToList(existing: readonly AudioClip[], clip: AudioClip, plan: TakeMergePlan): AudioClip[] {
  if (plan.disposition === 'already-merged') return [...existing]

  const updated = existing.map((c, i) => {
    if (plan.clearPrimaryAt.includes(i)) {
      const { primary: _primary, ...rest } = c
      return rest
    }
    if (i === plan.setPrimaryAt) return { ...c, primary: true as const }
    return c
  })

  return [...updated, clip]
}

/**
 * `plan` applied to an existing manifest `Document`, in place.
 *
 * Appends through `addIn` and edits the two `primary` markers through
 * `setIn`/`deleteIn` rather than `setIn`-ing the whole list back: every clip at
 * the key that the plan does not name keeps its own nodes, and with them any
 * hand-written comment or formatting sitting on it. `data/phonology/audio/
 * chaozhou.yaml` is 4 MB of hand-formatted flow-style YAML whose header text
 * explicitly invites hand-editing a clip, and this is the same
 * comment-preserving discipline ADR-0018 asks of every writer that touches it.
 *
 * `addIn` on a key that does not exist yet would create a *map* rather than a
 * one-element sequence (it builds the missing node from the value alone), so a
 * first clip at a key goes through `setIn` with an explicit list instead.
 */
export function applyTakePlanToDoc(
  doc: Document,
  bucket: 'clips' | 'wordClips',
  key: string,
  clip: AudioClip,
  plan: TakeMergePlan,
): void {
  if (plan.disposition === 'already-merged') return

  for (const index of plan.clearPrimaryAt) doc.deleteIn([bucket, key, index, 'primary'])
  if (plan.setPrimaryAt !== undefined) doc.setIn([bucket, key, plan.setPrimaryAt, 'primary'], true)

  if (doc.hasIn([bucket, key])) doc.addIn([bucket, key], clip)
  else doc.setIn([bucket, key], [clip])
}

/**
 * The one line a merge CLI prints about what happened to the take — shared so
 * `merge:local-recording` and `merge:lingualibre` describe the same outcome
 * the same way, and so a bulk merge's N lines read as one story.
 */
export function describeTake(result: { disposition: TakeDisposition; take: number; primary: boolean }): string {
  if (result.disposition === 'already-merged') {
    return `already published as take ${result.take}${result.primary ? ' (the published take)' : ' (training-only)'}`
  }
  if (result.disposition === 'appended-first') return "take 1 — this speaker's first clip here, so it is what plays"
  if (result.primary) return `take ${result.take} — now this speaker's published take; the previous one is training-only`
  return `take ${result.take} — training-only; what plays is unchanged (pass --primary to publish this one instead)`
}

/** The `take`/`primary` fields a clip built under `plan` carries — absent when the plan says they are implicit. */
export function takeFields(plan: TakeMergePlan): { take?: number; primary?: true } {
  return {
    ...(plan.take > 1 ? { take: plan.take } : {}),
    ...(plan.primary ? { primary: true as const } : {}),
  }
}
