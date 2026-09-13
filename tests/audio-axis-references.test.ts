import { describe, expect, it } from 'vitest'

import { buildAxisReferences } from '../src/audio/axis-references.js'
import type { ManifestClip } from '../src/audio/clip-cache.js'
import { emptyFeaturesCache } from '../src/audio/features.js'
import { emptyMfccCache } from '../src/audio/mfcc.js'

function manifestClip(key: string, checksum: string): ManifestClip {
  return { key, index: 0, path: `clips.${key}[0]`, clip: { checksum: `sha256:${checksum}`, url: 'https://x', confidence: 'high' } as ManifestClip['clip'] }
}

describe('buildAxisReferences', () => {
  it('parses each key into initial/rime/tone and carries onsetMs/f0Contour through', () => {
    const mfccCache = emptyMfccCache()
    mfccCache.clips['abc'] = { frames: [[1, 2]] }
    const featuresCache = emptyFeaturesCache()
    featuresCache.clips['abc'] = {
      totalMs: 500,
      sampleRate: 48000,
      trim: { startMs: 0, endMs: 500 },
      activeMs: 400,
      rmsDb: -20,
      peakDb: -10,
      onsetMs: 40,
      voicedMs: 300,
      voicedRatio: 0.75,
      f0: { medianHz: 120, startHz: 100, endHz: 140, contour: Array.from({ length: 20 }, (_, i) => 100 + i) },
    }

    const [ref] = buildAxisReferences([manifestClip('deng1', 'abc')], mfccCache, featuresCache)
    expect(ref).toEqual({
      key: 'deng1',
      initial: 'd',
      rime: 'eng',
      tone: 1,
      mfcc: [[1, 2]],
      onsetMs: 40,
      f0Contour: Array.from({ length: 20 }, (_, i) => 100 + i),
    })
  })

  it('drops a clip missing either cache entry rather than throwing', () => {
    const mfccCache = emptyMfccCache()
    const featuresCache = emptyFeaturesCache()
    expect(buildAxisReferences([manifestClip('deng1', 'missing')], mfccCache, featuresCache)).toEqual([])
  })
})
