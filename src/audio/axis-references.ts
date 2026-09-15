import { rimeOf, type AxisReferenceClip } from '@teochew/core'
import { checksumHex, type ManifestClip } from './clip-cache.js'
import type { FeaturesCache } from './features.js'
import type { MfccCache } from './mfcc.js'
import { parseSyllable } from '../phonology/syllable.js'

/** An `AxisReferenceClip` still tagged with its manifest key, for reporting, and its active duration for `estimateChecked`. */
export interface KeyedAxisReferenceClip extends AxisReferenceClip {
  key: string
  activeMs: number
}

/**
 * Assembles `classifyAxes`'s reference bank from the already-cached
 * MFCC/WORLD extractions (issue #280) — a clip missing either is dropped
 * rather than failing the whole run, same policy as `audio-classify.ts`'s
 * `candidates` filter.
 */
export function buildAxisReferences(
  entries: ManifestClip[],
  mfccCache: MfccCache,
  featuresCache: FeaturesCache,
): KeyedAxisReferenceClip[] {
  return entries.flatMap((entry) => {
    const checksum = checksumHex(entry.clip.checksum)
    const mfcc = mfccCache.clips[checksum]?.frames
    const features = featuresCache.clips[checksum]
    if (!mfcc || !features) return []
    const parsed = parseSyllable(entry.key)
    return [
      {
        key: entry.key,
        initial: parsed.initial ?? '',
        rime: rimeOf(parsed),
        tone: parsed.tone,
        nasalised: parsed.nasalised,
        coda: parsed.coda,
        mfcc,
        onsetMs: features.onsetMs,
        f0Contour: features.f0.contour,
        activeMs: features.activeMs,
      },
    ]
  })
}
