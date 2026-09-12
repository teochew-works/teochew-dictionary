import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  audioAssetPath,
  audioClipKey,
  contentTypeForFilename,
  uploadBytesToS3,
  type ExistingObject,
  type PutObjectParams,
} from '../src/importers/s3-upload.js'

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

describe('contentTypeForFilename', () => {
  it('maps every audio extension this project stores or derives', () => {
    expect(contentTypeForFilename('dio5.webm')).toBe('audio/webm')
    expect(contentTypeForFilename('dio5.wav')).toBe('audio/wav')
    expect(contentTypeForFilename('dio5.caf')).toBe('audio/x-caf')
    expect(contentTypeForFilename('dio5.opus')).toBe('audio/opus')
  })

  it('is case-insensitive on the extension', () => {
    expect(contentTypeForFilename('dio5.WEBM')).toBe('audio/webm')
  })

  it('throws for an unrecognised extension', () => {
    expect(() => contentTypeForFilename('dio5.mp3')).toThrow(/no known audio Content-Type/)
  })
})

describe('audioAssetPath', () => {
  it('nests the pengim key under a speaker directory', () => {
    expect(audioAssetPath('dio5', 'jky', '.webm')).toBe('jky/dio5.webm')
  })

  it('lowercases and hyphenates a multi-syllable key, independently of the speaker segment', () => {
    expect(audioAssetPath('dio5 ziu1', 'Someone', '.wav')).toBe('someone/dio5-ziu1.wav')
  })

  it('transliterates ê (a distinct vowel, not just an accented e) rather than stripping it', () => {
    // gêng1 and geng1 are different real syllables (README § Peng'im
    // gotchas) — stripping ê down to e would collapse them onto the same
    // path for the same speaker (confirmed live, issue #270).
    expect(audioAssetPath('gêng1', 'jky', '.webm')).not.toBe(audioAssetPath('geng1', 'jky', '.webm'))
    expect(audioAssetPath('sêg4', 'jky', '.webm')).toBe('jky/sexg4.webm')
  })

  it('strips other diacritics (not ê) so the path stays plain ASCII', () => {
    expect(audioAssetPath('dio5', 'Guì', '.webm')).toBe('gui/dio5.webm')
  })

  it('gives two different speakers of the same syllable two different paths', () => {
    expect(audioAssetPath('dio5', 'alice', '.wav')).not.toBe(audioAssetPath('dio5', 'bob', '.wav'))
  })
})

describe('audioClipKey', () => {
  it('nests every asset path under the shared teochew/clips/ prefix', () => {
    expect(audioClipKey('jky/dio5.webm')).toBe('teochew/clips/jky/dio5.webm')
  })
})

describe('uploadBytesToS3', () => {
  it('uploads a new key with the checksum, content type, and immutable cache header', async () => {
    const bytes = Buffer.from('fake audio bytes')
    const putCalls: PutObjectParams[] = []

    const result = await uploadBytesToS3(bytes, {
      key: 'teochew/clips/jky/dio5.webm',
      contentType: 'audio/webm',
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls).toEqual([
      { key: 'teochew/clips/jky/dio5.webm', body: bytes, contentType: 'audio/webm', checksum: sha256(bytes) },
    ])
    expect(result).toEqual({
      url: 'https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.webm',
      checksum: sha256(bytes),
    })
  })

  it('is a safe no-op when an identical object is already at that key', async () => {
    const bytes = Buffer.from('fake audio bytes')
    let putCalled = false
    const existing: ExistingObject = { checksum: sha256(bytes) }

    const result = await uploadBytesToS3(bytes, {
      key: 'teochew/clips/jky/dio5.webm',
      contentType: 'audio/webm',
      headObject: async () => existing,
      putObject: async () => {
        putCalled = true
      },
    })

    expect(putCalled).toBe(false)
    expect(result.checksum).toBe(sha256(bytes))
  })

  it('refuses to overwrite a different clip already at that key', async () => {
    const oldChecksum = sha256(Buffer.from('old bytes'))

    await expect(
      uploadBytesToS3(Buffer.from('new bytes'), {
        key: 'teochew/clips/jky/dio5.webm',
        contentType: 'audio/webm',
        headObject: async () => ({ checksum: oldChecksum }),
        putObject: async () => {},
      }),
    ).rejects.toThrow(/refusing to overwrite/)
  })

  it('treats an existing object with no recorded checksum as a mismatch, not a match', async () => {
    // A HeadObject response with no Metadata.checksum (e.g. an object PUT by
    // something other than this module) must never be assumed identical.
    await expect(
      uploadBytesToS3(Buffer.from('new bytes'), {
        key: 'teochew/clips/jky/dio5.webm',
        contentType: 'audio/webm',
        headObject: async () => ({}),
        putObject: async () => {},
      }),
    ).rejects.toThrow(/refusing to overwrite/)
  })

  it('overwrites a different clip at that key when overwrite is explicitly set', async () => {
    const oldChecksum = sha256(Buffer.from('old bytes'))
    const newBytes = Buffer.from('new bytes')
    const putCalls: PutObjectParams[] = []

    const result = await uploadBytesToS3(newBytes, {
      key: 'teochew/clips/jky/dio5.webm',
      contentType: 'audio/webm',
      overwrite: true,
      headObject: async () => ({ checksum: oldChecksum }),
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls).toEqual([
      { key: 'teochew/clips/jky/dio5.webm', body: newBytes, contentType: 'audio/webm', checksum: sha256(newBytes) },
    ])
    expect(result.checksum).toBe(sha256(newBytes))
  })

  it('is still a safe no-op with overwrite set when the existing object is already identical', async () => {
    const bytes = Buffer.from('fake audio bytes')
    let putCalled = false

    await uploadBytesToS3(bytes, {
      key: 'teochew/clips/jky/dio5.webm',
      contentType: 'audio/webm',
      overwrite: true,
      headObject: async () => ({ checksum: sha256(bytes) }),
      putObject: async () => {
        putCalled = true
      },
    })

    expect(putCalled).toBe(false)
  })
})
