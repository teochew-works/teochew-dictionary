import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import type { Audio } from '@teochew/core'
import { filterToKeys, mirrorAudioToS3, mirrorTargets, type MirrorOutcome, type MirrorProgress } from '../src/importers/audio-mirror.js'
import type { PutObjectParams } from '../src/importers/s3-upload.js'

const GITHUB_WEBM = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/dio5.webm'
const GITHUB_CAF = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou-caf/dio5.caf'

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

const WEBM_BYTES = Buffer.from('fake webm bytes')
const CAF_BYTES = Buffer.from('fake caf bytes')

function audioTable(clips: Audio['clips']): Audio {
  return { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips }
}

const clip = (overrides: Partial<Audio['clips'][string][number]> = {}) => ({
  url: GITHUB_WEBM,
  confidence: 'high' as const,
  sources: ['fixture'],
  speaker: 'jky',
  checksum: sha256(WEBM_BYTES),
  ...overrides,
})

function fakeBytes(byUrl: Record<string, Buffer>) {
  return async (url: string) => {
    const bytes = byUrl[url]
    if (!bytes) throw new Error(`unexpected fetch: ${url}`)
    return bytes
  }
}

describe('filterToKeys', () => {
  it('keeps only the requested keys from clips', () => {
    const audio = audioTable({ dio5: [clip()], ziu1: [clip()], geng1: [clip()] })
    const filtered = filterToKeys(audio, new Set(['dio5', 'geng1']))
    expect(Object.keys(filtered.clips).sort()).toEqual(['dio5', 'geng1'])
  })

  it('filters wordClips independently of clips', () => {
    const audio: Audio = {
      ...audioTable({ dio5: [clip()] }),
      wordClips: { 'dio5 ziu1': [clip()], 'geng1 dio5': [clip()] },
    }
    const filtered = filterToKeys(audio, new Set(['dio5 ziu1']))
    expect(Object.keys(filtered.clips)).toEqual([])
    expect(Object.keys(filtered.wordClips ?? {})).toEqual(['dio5 ziu1'])
  })

  it('silently drops a requested key absent from this variety, rather than erroring', () => {
    const audio = audioTable({ dio5: [clip()] })
    const filtered = filterToKeys(audio, new Set(['dio5', 'not-in-this-variety']))
    expect(Object.keys(filtered.clips)).toEqual(['dio5'])
  })
})

describe('mirrorTargets', () => {
  it('emits one target for a clip with no CAF alternate', () => {
    const audio = audioTable({ dio5: [clip()] })
    expect(mirrorTargets(audio)).toEqual([
      {
        bucket: 'clips',
        pengimKey: 'dio5',
        index: 0,
        field: 'url',
        sourceUrl: GITHUB_WEBM,
        expectedChecksum: clip().checksum,
      },
    ])
  })

  it('emits two targets — url and cafUrl — when a CAF alternate is present', () => {
    const withCaf = clip({ cafUrl: GITHUB_CAF, cafChecksum: sha256(CAF_BYTES) })
    const audio = audioTable({ dio5: [withCaf] })
    expect(mirrorTargets(audio).map((t) => t.field)).toEqual(['url', 'cafUrl'])
  })

  it('flattens across both clips and wordClips', () => {
    const audio: Audio = { ...audioTable({ dio5: [clip()] }), wordClips: { 'dio5 ziu1': [clip({ url: GITHUB_WEBM })] } }
    const targets = mirrorTargets(audio)
    expect(targets.map((t) => t.bucket)).toEqual(['clips', 'wordClips'])
  })
})

describe('mirrorAudioToS3', () => {
  it('dry run: fetches and verifies but uploads nothing, still reporting the target URL', async () => {
    const audio = audioTable({ dio5: [clip()] })
    let putCalled = false

    const result = await mirrorAudioToS3(audio, {
      write: false,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES }),
      headObject: async () => undefined,
      putObject: async () => {
        putCalled = true
      },
    })

    expect(result.scanned).toBe(1)
    expect(result.mismatches).toEqual([])
    expect(result.mirrored).toEqual([
      expect.objectContaining({ s3Url: 'https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.webm' }),
    ])
    expect(putCalled).toBe(false)
  })

  it('--write: uploads a verified clip to the key a fresh rehost of it would use', async () => {
    const audio = audioTable({ dio5: [clip()] })
    const putCalls: PutObjectParams[] = []

    const result = await mirrorAudioToS3(audio, {
      write: true,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES }),
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls).toHaveLength(1)
    expect(putCalls[0]?.key).toBe('teochew/clips/jky/dio5.webm')
    expect(putCalls[0]?.contentType).toBe('audio/webm')
    expect(result.mirrored[0]?.s3Url).toBe('https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.webm')
  })

  it('mirrors both a clip and its CAF alternate to sibling keys', async () => {
    const withCaf = clip({ cafUrl: GITHUB_CAF, cafChecksum: sha256(CAF_BYTES) })
    const audio = audioTable({ dio5: [withCaf] })
    const putCalls: PutObjectParams[] = []

    await mirrorAudioToS3(audio, {
      write: true,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES, [GITHUB_CAF]: CAF_BYTES }),
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls.map((p) => p.key)).toEqual(['teochew/clips/jky/dio5.webm', 'teochew/clips/jky/dio5.caf'])
  })

  it('reports a checksum mismatch instead of uploading, and continues past it to later targets', async () => {
    const table = audioTable({
      dio5: [clip({ checksum: `sha256:${'0'.repeat(64)}` })],
      ziu1: [clip({ url: 'https://github.com/x/y/releases/download/z/ziu1.webm' })],
    })
    let putCalled = false

    const result = await mirrorAudioToS3(table, {
      write: true,
      fetchBytes: fakeBytes({
        [GITHUB_WEBM]: WEBM_BYTES,
        'https://github.com/x/y/releases/download/z/ziu1.webm': WEBM_BYTES,
      }),
      headObject: async () => undefined,
      putObject: async () => {
        putCalled = true
      },
    })

    expect(result.mismatches).toEqual([expect.objectContaining({ pengimKey: 'dio5', field: 'url' })])
    expect(result.mirrored).toEqual([expect.objectContaining({ pengimKey: 'ziu1' })])
    // ziu1 (the un-mismatched target) still gets uploaded — a bad clip must
    // not block the rest of the corpus from mirroring.
    expect(putCalled).toBe(true)
  })

  it('records a fetch failure instead of throwing, and continues past it to later targets', async () => {
    // Confirmed necessary against the real corpus (issue #270): a single
    // uncaught HTTP 500 on one CAF asset aborted the whole run and
    // discarded every target already scanned before it.
    const table = audioTable({
      dio5: [clip()],
      ziu1: [clip({ url: 'https://github.com/x/y/releases/download/z/ziu1.webm' })],
    })

    const result = await mirrorAudioToS3(table, {
      write: false,
      fetchBytes: async (url) => {
        if (url === GITHUB_WEBM) throw new Error('HTTP 500 fetching ' + url)
        return WEBM_BYTES
      },
      headObject: async () => undefined,
      putObject: async () => {},
    })

    expect(result.failed).toEqual([
      expect.objectContaining({ pengimKey: 'dio5', field: 'url', error: expect.stringContaining('HTTP 500') }),
    ])
    expect(result.mirrored).toEqual([expect.objectContaining({ pengimKey: 'ziu1' })])
    expect(result.scanned).toBe(2)
  })

  it('records an upload failure (e.g. a checksum-mismatch refusal from uploadBytesToS3) rather than throwing', async () => {
    const audio = audioTable({ dio5: [clip()] })

    const result = await mirrorAudioToS3(audio, {
      write: true,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES }),
      headObject: async () => ({ checksum: sha256(Buffer.from('a different clip entirely')) }),
      putObject: async () => {},
    })

    expect(result.failed).toEqual([
      expect.objectContaining({ pengimKey: 'dio5', error: expect.stringContaining('refusing to overwrite') }),
    ])
    expect(result.mirrored).toEqual([])
  })

  it('is resumable: an already-mirrored, checksum-matching key is skipped, not re-uploaded', async () => {
    const audio = audioTable({ dio5: [clip()] })
    let putCalled = false

    const result = await mirrorAudioToS3(audio, {
      write: true,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES }),
      headObject: async () => ({ checksum: sha256(WEBM_BYTES) }),
      putObject: async () => {
        putCalled = true
      },
    })

    expect(putCalled).toBe(false)
    expect(result.mirrored[0]?.s3Url).toBe('https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.webm')
  })

  it('falls back to a placeholder speaker directory for a clip with none', async () => {
    const audio = audioTable({ dio5: [clip({ speaker: undefined })] })
    const putCalls: PutObjectParams[] = []

    await mirrorAudioToS3(audio, {
      write: true,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES }),
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls[0]?.key).toBe('teochew/clips/unknown-speaker/dio5.webm')
  })

  it('reports progress after each target, in order, with a running scanned/total count', async () => {
    const withCaf = clip({ cafUrl: GITHUB_CAF, cafChecksum: sha256(CAF_BYTES) })
    const audio = audioTable({ dio5: [withCaf] })
    const calls: Array<[MirrorProgress, MirrorOutcome['kind']]> = []

    await mirrorAudioToS3(audio, {
      write: false,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES, [GITHUB_CAF]: CAF_BYTES }),
      onProgress: (progress, outcome) => {
        calls.push([progress, outcome.kind])
      },
    })

    expect(calls).toEqual([
      [{ scanned: 1, total: 2 }, 'mirrored'],
      [{ scanned: 2, total: 2 }, 'mirrored'],
    ])
  })

  it('reports a mismatch outcome distinctly from a mirrored one', async () => {
    const audio = audioTable({ dio5: [clip({ checksum: `sha256:${'0'.repeat(64)}` })] })
    let outcome: MirrorOutcome | undefined

    await mirrorAudioToS3(audio, {
      write: false,
      fetchBytes: fakeBytes({ [GITHUB_WEBM]: WEBM_BYTES }),
      onProgress: (_progress, o) => {
        outcome = o
      },
    })

    expect(outcome?.kind).toBe('mismatch')
  })

  it('reports a failed outcome distinctly, without stopping progress reporting for later targets', async () => {
    const audio = audioTable({ dio5: [clip()], ziu1: [clip()] })
    const outcomes: MirrorOutcome['kind'][] = []

    await mirrorAudioToS3(audio, {
      write: false,
      fetchBytes: async () => {
        throw new Error('network blip')
      },
      onProgress: (_progress, o) => {
        outcomes.push(o.kind)
      },
    })

    expect(outcomes).toEqual(['failed', 'failed'])
  })
})
