import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
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

describe('audioClipKey', () => {
  it('nests every filename under the flat clips/ prefix', () => {
    expect(audioClipKey('dio5-jky.webm')).toBe('clips/dio5-jky.webm')
  })
})

describe('uploadBytesToS3', () => {
  it('uploads a new key with the checksum, content type, and immutable cache header', async () => {
    const bytes = Buffer.from('fake audio bytes')
    const putCalls: PutObjectParams[] = []

    const result = await uploadBytesToS3(bytes, {
      key: 'clips/dio5-jky.webm',
      contentType: 'audio/webm',
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls).toEqual([
      { key: 'clips/dio5-jky.webm', body: bytes, contentType: 'audio/webm', checksum: sha256(bytes) },
    ])
    expect(result).toEqual({
      url: 'https://daidb11aas52z.cloudfront.net/clips/dio5-jky.webm',
      checksum: sha256(bytes),
    })
  })

  it('is a safe no-op when an identical object is already at that key', async () => {
    const bytes = Buffer.from('fake audio bytes')
    let putCalled = false
    const existing: ExistingObject = { checksum: sha256(bytes) }

    const result = await uploadBytesToS3(bytes, {
      key: 'clips/dio5-jky.webm',
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
        key: 'clips/dio5-jky.webm',
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
        key: 'clips/dio5-jky.webm',
        contentType: 'audio/webm',
        headObject: async () => ({}),
        putObject: async () => {},
      }),
    ).rejects.toThrow(/refusing to overwrite/)
  })
})
