import type { AudioClip } from '@teochew/core'

/**
 * Is this clip the one take of its speaker's that leaves `data/` (ADR-0029)?
 *
 * "Only primaries leave `data/`" is the rule everything downstream follows —
 * `dist/`, the web UI, the mobile app, the `-n` render tier and `audio:grade`
 * all filter a key's clips through this predicate first, so that each sees
 * exactly one clip per speaker per key, as they did before a speaker could
 * hold more than one take.
 *
 * A speaker's group of more than one clip marks its published take
 * `primary: true` explicitly; a lone clip is implicitly primary, which is why
 * none of the pre-ADR-0029 manifest entries needed editing. `src/validate/`
 * enforces exactly-one-primary-per-group, so within a valid manifest these
 * two cases never disagree.
 *
 * Two clips are never primary:
 *
 * - a `synthesis` render — it is a *derived* tier of some speaker's primary
 *   (ADR-0027), and its own `derivedFrom` must name one, so letting a render
 *   count as a primary would allow renders of renders;
 * - nothing else — a clip with no `speaker` at all has no group to compete
 *   within (the same convention the validator uses when it skips such clips),
 *   so it is primary on its own.
 *
 * Deliberately kept in its own module with no imports but the schema types:
 * the validator, the build and the audio tooling all need this one definition
 * and none of them should have to pull in each other to get it.
 *
 * @param clip one clip at a key.
 * @param clips every clip at that same key, `clip` included.
 */
export function isPrimary(clip: AudioClip, clips: readonly AudioClip[]): boolean {
  if (clip.synthesis !== undefined) return false
  if (clip.primary === true) return true
  if (clip.speaker === undefined) return true
  return clips.filter((c) => c.synthesis === undefined && c.speaker === clip.speaker).length <= 1
}

/**
 * The clips at one key that leave `data/` for `dist/`, the web UI and the
 * mobile app (ADR-0029): every already-published `synthesis` render
 * (ADR-0027) plus each remaining speaker's primary take.
 *
 * Deliberately *not* a plain `isPrimary` filter — `isPrimary` calls every
 * render non-primary, but for a narrower reason than "never leaves `data/`":
 * it exists so `merge:resynth` never treats a render as a valid *source* to
 * derive from (a render of a render). A render already publishes as the
 * sole clip of its own `<speaker>-n` id, so it was never part of the
 * take-group problem `isPrimary` otherwise solves, and dropping it here
 * would silently remove every published render from `dist/` — the opposite
 * of what ADR-0027 shipped it for. `src/build/enrich.ts` and
 * `src/build/sounds.ts` both filter through this before anything else runs;
 * `src/cli/audio-grade.ts` and `src/cli/audio-synthesize.ts` want the
 * stricter `isPrimary` instead, since a render must never feed grading
 * statistics or be mistaken for a synthesis source.
 *
 * @param clips every clip at one key, in manifest order.
 */
export function publishedClipsAt(clips: readonly AudioClip[]): AudioClip[] {
  return clips.filter((c) => c.synthesis !== undefined || isPrimary(c, clips))
}
