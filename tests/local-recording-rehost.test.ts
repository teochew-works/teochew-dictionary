import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assetFilename, rehostLocalRecording, resolveLocalRecordingProposal } from '../src/importers/local-recording-rehost.js'
import type { LocalRecordingProposal } from '../src/importers/local-recording-types.js'
import type { PutObjectParams } from '../src/importers/s3-upload.js'

function proposal(overrides: Partial<LocalRecordingProposal> = {}): LocalRecordingProposal {
  return {
    pengim: 'dio5',
    syllableCount: 1,
    localPath: 'data/staging/recordings/chaozhou/dio5__speaker-1__20260823.wav',
    speaker: 'speaker-1',
    recordedDate: '2026-08-23',
    consentAcknowledged: true,
    variety: 'chaozhou',
    ...overrides,
  }
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

describe('resolveLocalRecordingProposal', () => {
  const proposals = [proposal({ pengim: 'dio5' }), proposal({ pengim: 'ang1' })]

  it('resolves a numeric index', () => {
    expect(resolveLocalRecordingProposal('1', proposals)).toBe(proposals[1])
  })

  it('resolves an exact pengim match', () => {
    expect(resolveLocalRecordingProposal('ang1', proposals)).toBe(proposals[1])
  })

  it('returns undefined for an out-of-range index', () => {
    expect(resolveLocalRecordingProposal('5', proposals)).toBeUndefined()
  })

  it('returns undefined for an unmatched pengim', () => {
    expect(resolveLocalRecordingProposal('bhue2', proposals)).toBeUndefined()
  })
})

describe('assetFilename', () => {
  it('nests the pengim key under the speaker directory, keeping the local file extension', () => {
    expect(
      assetFilename(
        proposal({ pengim: 'dio5', speaker: 'speaker-1', localPath: 'data/staging/recordings/chaozhou/dio5.wav' }),
      ),
    ).toBe('speaker-1/dio5.wav')
  })

  it('lowercases the key', () => {
    expect(assetFilename(proposal({ pengim: 'Dio5', speaker: 'speaker-1', localPath: 'x.WAV' }))).toBe(
      'speaker-1/dio5.wav',
    )
  })

  it('falls back to .wav when the local path has no recognisable extension', () => {
    expect(assetFilename(proposal({ pengim: 'dio5', speaker: 'speaker-1', localPath: 'no-extension' }))).toBe(
      'speaker-1/dio5.wav',
    )
  })

  it('strips diacritics so the path stays plain ASCII', () => {
    expect(assetFilename(proposal({ pengim: 'sêg4', speaker: 'speaker-1', localPath: 'x.webm' }))).toBe(
      'speaker-1/seg4.webm',
    )
  })

  it('gives two different speakers of the same syllable two different paths', () => {
    const a = assetFilename(proposal({ pengim: 'dio5', speaker: 'speaker-1' }))
    const b = assetFilename(proposal({ pengim: 'dio5', speaker: 'speaker-2' }))
    expect(a).not.toBe(b)
  })
})

describe('rehostLocalRecording', () => {
  it('reads local bytes, checksums, and uploads to S3, returning a CloudFront URL', async () => {
    const bytes = Buffer.from('fake audio bytes')
    const putCalls: PutObjectParams[] = []

    const result = await rehostLocalRecording(proposal(), {
      readBytes: () => bytes,
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls).toHaveLength(1)
    expect(putCalls[0]?.key).toBe('teochew/clips/speaker-1/dio5.wav')
    expect(result.url).toBe('https://daidb11aas52z.cloudfront.net/teochew/clips/speaker-1/dio5.wav')
    expect(result.checksum).toBe(sha256(bytes))
  })

  it('is a safe no-op when the key already holds an identical clip (a resumed run)', async () => {
    const bytes = Buffer.from('fake audio bytes')
    let putCalled = false

    const result = await rehostLocalRecording(proposal(), {
      readBytes: () => bytes,
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
      rehostLocalRecording(proposal(), {
        readBytes: () => Buffer.from('new bytes'),
        headObject: async () => ({ checksum: sha256(Buffer.from('old bytes')) }),
        putObject: async () => {},
      }),
    ).rejects.toThrow(/refusing to overwrite/)
  })

  it('defaults to reading proposal.localPath from disk when readBytes is not injected', async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), 'local-recording-source-'))
    const sourcePath = join(sourceDir, 'dio5.wav')
    writeFileSync(sourcePath, 'real bytes on disk')

    const result = await rehostLocalRecording(proposal({ localPath: sourcePath }), {
      headObject: async () => undefined,
      putObject: async () => {},
    })

    expect(result.checksum).toMatch(/^sha256:[0-9a-f]{64}$/u)

    rmSync(sourceDir, { recursive: true, force: true })
  })
})
