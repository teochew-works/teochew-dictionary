import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { GITHUB_REPO } from '@teochew/core'
import { verifyAudioRemote, type AudioSource, type VerifyTarget } from '../src/validate/audio-remote.js'
import { AUDIO_CLIP_URL, AUDIO_WORD_CLIP_URL, audioTable, makeClipFixture } from './helpers/audio-fixtures.js'

function checksumOf(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

const BODY = 'pretend opus bytes'
const CHECKSUM = `sha256:${checksumOf(BODY)}`
const URL = AUDIO_CLIP_URL

const audio = audioTable
const clip = makeClipFixture(CHECKSUM)

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
    expect(issues[0]).toMatchObject({ level: 'error', path: 'clips.dio5[0]' })
    expect(issues[0]?.message).toContain('HTTP 404')
  })

  it('flags a checksum mismatch', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) }]
    const fetchClip = fetchClipFixture({ [URL]: { status: 200, body: 'different bytes entirely' } })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', path: 'clips.dio5[0].checksum' })
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
        audio: { audio: { id: 'shantou', variety: 'shantou' }, clips: { ziu1: [clip({ url: url2 })] } },
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

  it('reports progress once per clip, regardless of how it resolved', async () => {
    const url2 = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/ziu1.opus`
    const sources: AudioSource[] = [
      { file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip(), ziu1: clip({ url: url2 }) }) },
    ]
    const fetchClip = fetchClipFixture({ [URL]: { status: 200, body: BODY }, [url2]: { status: 404, body: '' } })
    const calls: [number, number][] = []

    await verifyAudioRemote(sources, { fetchClip, onProgress: (done, total) => calls.push([done, total]) })

    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  /**
   * `src/cli/audio-verify.ts` builds this list once (for its progress-meter
   * count) and hands it straight to `verifyAudioRemote`, so it must be
   * honoured verbatim rather than silently recomputed from `sources` — a
   * `targets` list that disagrees with what `sources` would produce is the
   * only way to prove which one actually drove the fetch.
   */
  it('honours a precomputed `targets` list instead of recomputing from sources', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) }]
    const customUrl = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/custom.opus`
    const targets: VerifyTarget[] = [
      { file: 'data/phonology/audio/chaozhou.yaml', path: 'clips.custom[0]', checksumPath: 'clips.custom[0].checksum', url: customUrl, checksum: CHECKSUM },
    ]
    const fetched: string[] = []
    const fetchClip = async (url: string): Promise<Response> => {
      fetched.push(url)
      return new Response(BODY, { status: 200 })
    }

    const issues = await verifyAudioRemote(sources, { fetchClip, targets })

    expect(fetched).toEqual([customUrl])
    expect(issues).toEqual([])
  })
})

/**
 * `wordClips` (issue #106) was added to the schema after this verifier was
 * written, and went unchecked: the loop only walked `clips`, so word clips
 * were reported as verified without a single byte being fetched. The checksum
 * is their only integrity check — the bytes live on GitHub Releases, not in
 * this repo (data/phonology/REVIEW.md § 12).
 */
describe('verifyAudioRemote over wordClips', () => {
  const wordUrl = AUDIO_WORD_CLIP_URL
  const wordClip = clip({ url: wordUrl })

  it('fetches and checksums a word clip', async () => {
    const sources: AudioSource[] = [
      { file: 'data/phonology/audio/chaozhou.yaml', audio: audio({}, { 'dio5 ziu1': wordClip }) },
    ]
    const fetchClip = fetchClipFixture({ [wordUrl]: { status: 200, body: BODY } })

    expect(await verifyAudioRemote(sources, { fetchClip })).toEqual([])
  })

  it('flags a word clip checksum mismatch against its own path', async () => {
    const sources: AudioSource[] = [
      { file: 'data/phonology/audio/chaozhou.yaml', audio: audio({}, { 'dio5 ziu1': wordClip }) },
    ]
    const fetchClip = fetchClipFixture({ [wordUrl]: { status: 200, body: 'different bytes entirely' } })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', path: 'wordClips.dio5 ziu1[0].checksum' })
  })

  it('checks clips and wordClips in the same table', async () => {
    const sources: AudioSource[] = [
      { file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }, { 'dio5 ziu1': wordClip }) },
    ]
    const fetchClip = fetchClipFixture({
      [URL]: { status: 200, body: BODY },
      [wordUrl]: { status: 404, body: '' },
    })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ path: 'wordClips.dio5 ziu1[0]' })
  })
})

/**
 * `cafUrl`/`cafChecksum` (issue #228) went the same way `wordClips` had:
 * added to the schema after this verifier was written, and never fetched. By
 * the time it was noticed every one of the 3,088 Chaozhou clips carried a CAF
 * alternate, so half of the published assets — and the half iOS actually
 * plays — were being reported as verified without a byte being fetched
 * (issue #238).
 */
describe('verifyAudioRemote over CAF alternates', () => {
  const cafUrl = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou-caf/audio-chaozhou-dio5.caf`
  const CAF_BODY = 'pretend caf bytes'
  const CAF_CHECKSUM = `sha256:${checksumOf(CAF_BODY)}`
  const withCaf = clip({ cafUrl, cafChecksum: CAF_CHECKSUM })

  it('fetches both assets when a clip carries an alternate', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: withCaf }) }]
    const fetched: string[] = []
    const fetchClip = async (url: string): Promise<Response> => {
      fetched.push(url)
      return new Response(url === cafUrl ? CAF_BODY : BODY, { status: 200 })
    }

    expect(await verifyAudioRemote(sources, { fetchClip })).toEqual([])
    expect(fetched).toEqual([URL, cafUrl])
  })

  it('fetches once for a clip with no alternate', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: clip() }) }]
    const fetched: string[] = []
    const fetchClip = async (url: string): Promise<Response> => {
      fetched.push(url)
      return new Response(BODY, { status: 200 })
    }

    await verifyAudioRemote(sources, { fetchClip })
    expect(fetched).toEqual([URL])
  })

  it('flags a CAF checksum mismatch against cafChecksum, not checksum', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: withCaf }) }]
    const fetchClip = fetchClipFixture({
      [URL]: { status: 200, body: BODY },
      [cafUrl]: { status: 200, body: 'different bytes entirely' },
    })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', path: 'clips.dio5[0].cafChecksum' })
    expect(issues[0]?.message).toContain(cafUrl)
  })

  it('flags a missing CAF asset against cafUrl, leaving the original clean', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: withCaf }) }]
    const fetchClip = fetchClipFixture({
      [URL]: { status: 200, body: BODY },
      [cafUrl]: { status: 404, body: '' },
    })

    const issues = await verifyAudioRemote(sources, { fetchClip })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'error', path: 'clips.dio5[0].cafUrl' })
    expect(issues[0]?.message).toContain('HTTP 404')
  })

  it('counts progress per asset, so a clip with an alternate is two steps', async () => {
    const sources: AudioSource[] = [{ file: 'data/phonology/audio/chaozhou.yaml', audio: audio({ dio5: withCaf }) }]
    const fetchClip = fetchClipFixture({
      [URL]: { status: 200, body: BODY },
      [cafUrl]: { status: 200, body: CAF_BODY },
    })
    const calls: [number, number][] = []

    await verifyAudioRemote(sources, { fetchClip, onProgress: (done, total) => calls.push([done, total]) })

    expect(calls).toEqual([
      [1, 2],
      [2, 2],
    ])
  })
})
