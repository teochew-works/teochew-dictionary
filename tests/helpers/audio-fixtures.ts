import { GITHUB_REPO, type Audio } from '../../src/schema/phonology.js'

/** Shared by tests/audio.test.ts and tests/audio-remote.test.ts. */

export const AUDIO_CLIP_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.opus`
export const AUDIO_WORD_CLIP_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/dio5-ziu1.opus`

export function audioTable(clips: Audio['clips'] = {}, wordClips?: Audio['wordClips']): Audio {
  return { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips, ...(wordClips !== undefined && { wordClips }) }
}

/** Bind a default checksum so each test file's clip() reflects its own fixtures (real bytes vs. placeholder). */
export function makeClipFixture(defaultChecksum: string) {
  return function clip(overrides: Partial<Audio['clips'][string]> = {}): Audio['clips'][string] {
    return {
      url: AUDIO_CLIP_URL,
      confidence: 'high',
      sources: ['fixture'],
      checksum: defaultChecksum,
      ...overrides,
    }
  }
}
