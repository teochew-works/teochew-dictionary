import { GITHUB_REPO, type Audio, type AudioClip } from '@teochew/core'

/** Shared by tests/audio.test.ts and tests/audio-remote.test.ts. */

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
