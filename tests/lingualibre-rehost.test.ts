import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { assetFilename, rehostClip, resolveProposal } from '../src/importers/lingualibre-rehost.js'
import type { AudioClipProposal } from '../src/importers/audio-types.js'
import type { PutObjectParams } from '../src/importers/s3-upload.js'

function proposal(overrides: Partial<AudioClipProposal> = {}): AudioClipProposal {
  return {
    pengim: 'dio5 ziu1',
    syllableCount: 2,
    commonsTitle: 'File:LL-Q36759-Someone-dio5 ziu1.wav',
    commonsUrl: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/LL-Q36759-Someone-dio5%20ziu1.wav',
    speaker: 'Someone',
    licence: 'CC-BY-SA-4.0',
    ...overrides,
  }
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

describe('resolveProposal', () => {
  const proposals = [proposal({ commonsTitle: 'File:A.wav' }), proposal({ commonsTitle: 'File:B.wav' })]

  it('resolves a numeric index', () => {
    expect(resolveProposal('1', proposals)).toBe(proposals[1])
  })

  it('resolves an exact commonsTitle match', () => {
    expect(resolveProposal('File:B.wav', proposals)).toBe(proposals[1])
  })

  it('returns undefined for an out-of-range index', () => {
    expect(resolveProposal('5', proposals)).toBeUndefined()
  })

  it('returns undefined for an unmatched title', () => {
    expect(resolveProposal('File:Nope.wav', proposals)).toBeUndefined()
  })
})

describe('assetFilename', () => {
  it('hyphenates a multi-syllable pengim key, appends the speaker, and keeps the source extension', () => {
    expect(assetFilename(proposal({ pengim: 'dio5 ziu1', speaker: 'Someone', commonsUrl: '.../x.wav' }))).toBe(
      'dio5-ziu1-someone.wav',
    )
  })

  it('lowercases the key and speaker', () => {
    expect(assetFilename(proposal({ pengim: 'Dio5', speaker: 'Someone', commonsUrl: '.../x.WAV' }))).toBe(
      'dio5-someone.wav',
    )
  })

  it('falls back to .wav when the source url has no recognisable extension', () => {
    expect(
      assetFilename(proposal({ pengim: 'dio5', speaker: 'Someone', commonsUrl: 'https://example.com/no-extension' })),
    ).toBe('dio5-someone.wav')
  })

  it('gives two different speakers of the same syllable two different filenames', () => {
    const a = assetFilename(proposal({ pengim: 'dio5', speaker: 'Alice', commonsUrl: '.../x.wav' }))
    const b = assetFilename(proposal({ pengim: 'dio5', speaker: 'Bob', commonsUrl: '.../x.wav' }))
    expect(a).not.toBe(b)
  })
})

describe('rehostClip', () => {
  it('downloads, checksums, and uploads to S3, returning a CloudFront URL', async () => {
    const bytes = Buffer.from('fake audio bytes')
    const putCalls: PutObjectParams[] = []

    const result = await rehostClip(proposal(), {
      fetchBytes: async () => bytes,
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls).toHaveLength(1)
    expect(putCalls[0]?.key).toBe('clips/dio5-ziu1-someone.wav')
    expect(putCalls[0]?.contentType).toBe('audio/wav')
    expect(result.url).toBe('https://daidb11aas52z.cloudfront.net/clips/dio5-ziu1-someone.wav')
    expect(result.checksum).toBe(sha256(bytes))
  })

  it('is a safe no-op when the key already holds an identical clip (a resumed run)', async () => {
    const bytes = Buffer.from('fake audio bytes')
    let putCalled = false

    const result = await rehostClip(proposal(), {
      fetchBytes: async () => bytes,
      headObject: async () => ({ checksum: sha256(bytes) }),
      putObject: async () => {
        putCalled = true
      },
    })

    expect(putCalled).toBe(false)
    expect(result.checksum).toBe(sha256(bytes))
  })

  it('refuses to overwrite a different clip already uploaded at the same key', async () => {
    await expect(
      rehostClip(proposal(), {
        fetchBytes: async () => Buffer.from('new bytes'),
        headObject: async () => ({ checksum: sha256(Buffer.from('old bytes')) }),
        putObject: async () => {},
      }),
    ).rejects.toThrow(/refusing to overwrite/)
  })
})
