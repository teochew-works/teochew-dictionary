import { describe, expect, it } from 'vitest'

import { audioSchema, type Audio } from '../src/schema/phonology.js'

function clip(overrides: Partial<Audio['clips'][string]> = {}): Audio['clips'][string] {
  return {
    file: 'dio5.opus',
    confidence: 'high',
    sources: ['fixture'],
    ...overrides,
  }
}

function audio(clips: Audio['clips'] = {}): Audio {
  return {
    audio: { id: 'chaozhou', variety: 'chaozhou' },
    clips,
  }
}

/** Raw (possibly invalid) input for schema tests — bypasses the typed `Audio` fixtures above. */
function rawAudio(clips: Record<string, unknown>): unknown {
  return { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips }
}

describe('audioSchema', () => {
  it('accepts a minimal clip (only the required fields)', () => {
    expect(() => audioSchema.parse(audio({ dio5: clip() }))).not.toThrow()
  })

  it('accepts a fully populated clip', () => {
    const full = clip({
      note: 'citation-form recording',
      speaker: 'speaker-1',
      recorded: '2026-08-01',
      checksum: `sha256:${'a'.repeat(64)}`,
    })
    expect(() => audioSchema.parse(audio({ dio5: full }))).not.toThrow()
  })

  it('rejects a clip with no sources — unlike a phonology mapping, this is required', () => {
    const bad = { file: 'dio5.opus', confidence: 'high', sources: [] }
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a clip missing confidence', () => {
    const bad = { file: 'dio5.opus', sources: ['fixture'] }
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a malformed checksum', () => {
    const bad = clip({ checksum: 'not-a-checksum' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a malformed recorded date', () => {
    const bad = clip({ recorded: '1 Aug 2026' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })
})
