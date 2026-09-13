/**
 * Distance between two 20-point time-normalised F0 contours (Hz) — the tone
 * axis's distance function (issue #280), used in place of DTW: both
 * `ClipFeatures.f0.contour` and `pitch.ts`'s equivalent are already
 * time-normalised across the voiced span, so no alignment step is needed.
 *
 * Compared in log2-Hz (semitone-proportional) space, matching
 * `normalised_contour`'s own log-domain interpolation in
 * tools/resynth/src/resynth/features.py — pitch differences are perceived
 * multiplicatively, not on a linear Hz scale, and prior work comparing tone
 * perception models found direct contour comparison (no hand-built tonal
 * features) outperforms feature-engineered approaches.
 */
export function contourDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.log2(a[i]!) - Math.log2(b[i]!)
    sum += d * d
  }
  return Math.sqrt(sum / a.length)
}
