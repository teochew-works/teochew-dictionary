import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { GITHUB_REPO, type Audio } from '../src/schema/phonology.js'
import { verifyAudioRemote, type AudioSource } from '../src/validate/audio-remote.js'

function checksumOf(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

const BODY = 'pretend opus bytes'
const CHECKSUM = `sha256:${checksumOf(BODY)}`
const URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.opus`

function audio(clips: Audio['clips']): Audio {
  return { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips }
}

function clip(overrides: Partial<Audio['clips'][string]> = {}): Audio['clips'][string] {
  return { url: URL, confidence: 'high', sources: ['fixture'], checksum: CHECKSUM, ...overrides }
}

function fetchClipFixture(bodiesByUrl: Record<string, { status: number; body: string }>) {
  return async (url: string): Promise<Response> => {
    const entry = bodiesByUrl[url]
    if (!entry) throw new Error(`unexpected fetch: ${url}`)
    return new Response(entry.body, { status: entry.status })
  }
}

describe('verifyAudioRemote', () => {
  it('reports no issues when every clip fetches and checksums cleanly', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) }]
    const fetchClip = fetchClipFixture({ [URL]: { status: 200, body: BODY } })

    expect(await verifyAudioRemote(sources, { fetchClip })).toEqual([])
  })

  it('flags a non-ok HTTP response', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) }]
    const fetchClip = fetchClipFixture({ [URL]: { status: 404, body: '' } })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', path: 'clips.dio5' })
    expect(issues[0]?.message).toContain('HTTP 404')
  })

  it('flags a checksum mismatch', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) }]
    const fetchClip = fetchClipFixture({ [URL]: { status: 200, body: 'different bytes entirely' } })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', path: 'clips.dio5.checksum' })
    expect(issues[0]?.message).toContain('checksum mismatch')
  })

  it('flags a fetch that throws (e.g. network failure)', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) }]
    const fetchClip = async (): Promise<Response> => {
      throw new Error('ECONNRESET')
    }

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('failed to fetch')
    expect(issues[0]?.message).toContain('ECONNRESET')
  })

  it('aggregates issues across multiple varieties and clips', async () => {
    const url2 = `https://github.com/${GITHUB_REPO}/releases/download/audio-shantou/ziu1.opus`
    const sources: AudioSource[] = [
      { file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) },
      {
        file: 'data/phonology/audio/shantou.yaml',
        audio: { audio: { id: 'shantou', variety: 'shantou' }, clips: { ziu1: clip({ url: url2 }) } },
      },
    ]
    const fetchClip = fetchClipFixture({
      [URL]: { status: 200, body: BODY },
      [url2]: { status: 500, body: '' },
    })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ file: 'data/phonology/audio/shantou.yaml' })
  })
})
