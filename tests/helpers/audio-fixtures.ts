import { GITHUB_REPO, type Audio, type AudioClip } from '@teochew/core'

import type { ClipFeatures } from '../../src/audio/features.js'
import type { RenderInfo } from '../../src/audio/synthesize.js'

/** Shared by tests/audio*.test.ts. */

export const AUDIO_CLIP_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.opus`
export const AUDIO_WORD_CLIP_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/dio5-ziu1.opus`

/**
 * A key's value may be given as one clip (the common case in these fixtures)
 * or a list (issue #134, when a test needs more than one clip at the same
 * key) — normalised to `Audio['clips'][string]`'s real (list) shape either
 * way, so most call sites can keep passing a bare `clip()` unchanged.
 */
type ClipInput = AudioClip | AudioClip[]

function normalize(table: Record<string, ClipInput>): Record<string, AudioClip[]> {
  return Object.fromEntries(Object.entries(table).map(([key, v]) => [key, Array.isArray(v) ? v : [v]]))
}

export function audioTable(clips: Record<string, ClipInput> = {}, wordClips?: Record<string, ClipInput>): Audio {
  return {
    audio: { id: 'chaozhou', variety: 'chaozhou' },
    clips: normalize(clips),
    ...(wordClips !== undefined && { wordClips: normalize(wordClips) }),
  }
}

/** Bind a default checksum so each test file's clip() reflects its own fixtures (real bytes vs. placeholder). */
export function makeClipFixture(defaultChecksum: string) {
  return function clip(overrides: Partial<AudioClip> = {}): AudioClip {
    return {
      url: AUDIO_CLIP_URL,
      confidence: 'high',
      sources: ['fixture'],
      checksum: defaultChecksum,
      ...overrides,
    }
  }
}

/** Mirrors the real `du2.webm` corpus clip as tools/resynth measures it. */
export const DU2_FEATURES: ClipFeatures = {
  totalMs: 960,
  sampleRate: 48000,
  trim: { startMs: 240, endMs: 680 },
  activeMs: 440,
  rmsDb: -13.3,
  peakDb: -6.1,
  onsetMs: 45,
  voicedMs: 380,
  voicedRatio: 0.87,
  f0: { medianHz: 114.6, startHz: 101, endHz: 90.9, contour: Array.from({ length: 20 }, (_, i) => 120 - i * 1.5) },
}

/** What `resynth synthesize` reports having done to one clip. */
export const RENDER_INFO: RenderInfo = {
  referenceHz: 140,
  sourceTrim: { startMs: 370, endMs: 800 },
  sourceOnsetMs: 0,
  sourceVoicedMs: 435,
  renderedOnsetMs: 0,
  renderedVoicedMs: 450,
  gainDb: -4.9,
  onsetGainDb: 0,
  tailGainDb: 0,
  activeStartMs: 50,
  activeEndMs: 500,
}
