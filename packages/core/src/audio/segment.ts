/**
 * Splits one clip's MFCC frames into an initial window and a rime window
 * (issue #280) — the input to running DTW twice (once per axis) instead of
 * once over the whole clip.
 *
 * `onsetMs` (WORLD's unvoiced-onset estimate, `ClipFeatures.onsetMs` /
 * `pitch.ts`'s equivalent for a live query) marks a real boundary for an
 * obstruent initial. A sonorant initial (nasal, lateral, glide) is already
 * voiced from frame 0, so its `onsetMs` is null or near-zero and gives no
 * usable boundary — `minOnsetMs`/`fallbackWindowMs` are the empirical knobs
 * for that case, tuned against held-out accuracy rather than fixed here.
 */

export interface SegmentParams {
  hopMs: number
  /** Below this, `onsetMs` is untrusted (sonorant initial, already voiced ~frame 0) — use `fallbackWindowMs` instead. */
  minOnsetMs: number
  /** Fixed initial-window length (ms) used when `onsetMs` is null or below `minOnsetMs`. */
  fallbackWindowMs: number
}

export const DEFAULT_SEGMENT_PARAMS: SegmentParams = { hopMs: 10, minOnsetMs: 30, fallbackWindowMs: 90 }

export interface SegmentedFrames {
  initial: number[][]
  rime: number[][]
}

export function segmentFrames(
  frames: number[][],
  onsetMs: number | null,
  params: SegmentParams = DEFAULT_SEGMENT_PARAMS,
): SegmentedFrames {
  const boundaryMs = onsetMs != null && onsetMs >= params.minOnsetMs ? onsetMs : params.fallbackWindowMs
  const boundaryFrame = Math.min(Math.max(Math.round(boundaryMs / params.hopMs), 0), frames.length)
  return { initial: frames.slice(0, boundaryFrame), rime: frames.slice(boundaryFrame) }
}
