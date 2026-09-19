import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assetFilename, rehostLocalRecording, resolveLocalRecordingProposals } from '../src/importers/local-recording-rehost.js'
import type { LocalRecordingProposal } from '../src/importers/local-recording-types.js'
import type { PutObjectParams } from '../src/importers/s3-upload.js'

function proposal(overrides: Partial<LocalRecordingProposal> = {}): LocalRecordingProposal & { speaker: string } {
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

describe('resolveLocalRecordingProposals', () => {
  const proposals = [proposal({ pengim: 'dio5' }), proposal({ pengim: 'ang1' })]

  it('resolves a numeric index to exactly that one proposal', () => {
    expect(resolveLocalRecordingProposals('1', proposals)).toEqual([proposals[1]])
  })

  it('resolves an exact pengim match', () => {
    expect(resolveLocalRecordingProposals('ang1', proposals)).toEqual([proposals[1]])
  })

  it('returns every staged take of one pengim, in staging order (ADR-0029, issue #290)', () => {
    // The elicitation UI (issue #288) stages several takes of one target under
    // one key — a `.find()` here made every take but the earliest unreachable.
    const takes = [
      proposal({ pengim: 'ku3', localPath: 'a.webm' }),
      proposal({ pengim: 'ang1' }),
      proposal({ pengim: 'ku3', localPath: 'b.webm' }),
      proposal({ pengim: 'ku3', localPath: 'c.webm' }),
    ]
    expect(resolveLocalRecordingProposals('ku3', takes).map((p) => p.localPath)).toEqual(['a.webm', 'b.webm', 'c.webm'])
  })

  it('narrows a pengim match to one variety when asked', () => {
    const takes = [
      proposal({ pengim: 'ku3', variety: 'chaozhou', localPath: 'cz.webm' }),
      proposal({ pengim: 'ku3', variety: 'shantou', localPath: 'st.webm' }),
    ]
    expect(resolveLocalRecordingProposals('ku3', takes, { variety: 'chaozhou' }).map((p) => p.localPath)).toEqual([
      'cz.webm',
    ])
  })

  it('ignores the variety narrowing for an explicit index — merging across varieties stays a human call', () => {
    const takes = [proposal({ pengim: 'ku3', variety: 'shantou', localPath: 'st.webm' })]
    expect(resolveLocalRecordingProposals('0', takes, { variety: 'chaozhou' })).toEqual([takes[0]])
  })

  it('returns nothing for an out-of-range index', () => {
    expect(resolveLocalRecordingProposals('5', proposals)).toEqual([])
  })

  it('returns nothing for an unmatched pengim', () => {
    expect(resolveLocalRecordingProposals('bhue2', proposals)).toEqual([])
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

  it('transliterates ê to ex rather than stripping it to plain e (issue #270 — they are different vowels)', () => {
    expect(assetFilename(proposal({ pengim: 'sêg4', speaker: 'speaker-1', localPath: 'x.webm' }))).toBe(
      'speaker-1/sexg4.webm',
    )
  })

  it('gives two different speakers of the same syllable two different paths', () => {
    const a = assetFilename(proposal({ pengim: 'dio5', speaker: 'speaker-1' }))
    const b = assetFilename(proposal({ pengim: 'dio5', speaker: 'speaker-2' }))
    expect(a).not.toBe(b)
  })

  it('reproduces today\'s path unchanged when take is absent (regression, ADR-0029)', () => {
    expect(assetFilename(proposal({ pengim: 'dio5', speaker: 'speaker-1' }))).toBe('speaker-1/dio5.wav')
  })

  it('appends -take<N> when take is given (ADR-0029, issue #290)', () => {
    expect(assetFilename(proposal({ pengim: 'dio5', speaker: 'speaker-1' }), 2)).toBe('speaker-1/dio5-take2.wav')
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

  it('uploads a second take to its own -take<N> key (ADR-0029, issue #290)', async () => {
    const bytes = Buffer.from('fake audio bytes')
    const putCalls: PutObjectParams[] = []

    const result = await rehostLocalRecording(proposal(), {
      take: 2,
      readBytes: () => bytes,
      headObject: async () => undefined,
      putObject: async (params) => {
        putCalls.push(params)
      },
    })

    expect(putCalls[0]?.key).toBe('teochew/clips/speaker-1/dio5-take2.wav')
    expect(result.url).toBe('https://daidb11aas52z.cloudfront.net/teochew/clips/speaker-1/dio5-take2.wav')
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
