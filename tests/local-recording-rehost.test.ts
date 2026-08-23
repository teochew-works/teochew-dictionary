import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GITHUB_REPO } from '../src/schema/phonology.js'
import { assetFilename, rehostLocalRecording, resolveLocalRecordingProposal } from '../src/importers/local-recording-rehost.js'
import type { LocalRecordingProposal } from '../src/importers/local-recording-types.js'

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
  it('slugs the pengim key and keeps the local file extension', () => {
    expect(assetFilename(proposal({ pengim: 'dio5', localPath: 'data/staging/recordings/chaozhou/dio5.wav' }))).toBe(
      'dio5.wav',
    )
  })

  it('lowercases the key', () => {
    expect(assetFilename(proposal({ pengim: 'Dio5', localPath: 'x.WAV' }))).toBe('dio5.wav')
  })

  it('falls back to .wav when the local path has no recognisable extension', () => {
    expect(assetFilename(proposal({ pengim: 'dio5', localPath: 'no-extension' }))).toBe('dio5.wav')
  })

  it('strips diacritics so the filename stays plain ASCII', () => {
    expect(assetFilename(proposal({ pengim: 'sêg4', localPath: 'x.webm' }))).toBe('seg4.webm')
  })
})

describe('rehostLocalRecording', () => {
  it('reads local bytes, checksums, and uploads via the injected gh runner, returning a GitHub Release URL', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'local-recording-rehost-test-'))
    const ghCalls: string[][] = []
    const bytes = Buffer.from('fake audio bytes')

    const result = await rehostLocalRecording(proposal(), {
      tag: 'audio-teochew-dictionary-audio-test',
      readBytes: () => bytes,
      releaseExists: () => true,
      runGh: (args) => ghCalls.push(args),
      tmpDir,
    })

    expect(ghCalls).toEqual([
      ['release', 'upload', 'audio-teochew-dictionary-audio-test', join(tmpDir, 'dio5.wav'), '--clobber'],
    ])
    expect(result.url).toBe(
      `https://github.com/${GITHUB_REPO}/releases/download/audio-teochew-dictionary-audio-test/dio5.wav`,
    )
    expect(result.checksum).toMatch(/^sha256:[0-9a-f]{64}$/u)

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("creates the release first when it doesn't exist yet, then uploads", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'local-recording-rehost-test-'))
    const ghCalls: string[][] = []

    await rehostLocalRecording(proposal(), {
      tag: 'audio-teochew-dictionary-audio-test',
      readBytes: () => Buffer.from('x'),
      releaseExists: () => false,
      runGh: (args) => ghCalls.push(args),
      tmpDir,
    })

    expect(ghCalls[0]).toEqual([
      'release',
      'create',
      'audio-teochew-dictionary-audio-test',
      '--title',
      'audio-teochew-dictionary-audio-test',
      '--notes',
      'Locally-recorded audio clips — see data/phonology/REVIEW.md § 17.',
    ])
    expect(ghCalls[1]?.[1]).toBe('upload')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('removes the local temp file after uploading', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'local-recording-rehost-test-'))
    let uploadedPath = ''

    await rehostLocalRecording(proposal(), {
      readBytes: () => Buffer.from('x'),
      releaseExists: () => true,
      runGh: (args) => {
        uploadedPath = args[2] ?? ''
      },
      tmpDir,
    })

    expect(uploadedPath).not.toBe('')
    expect(existsSync(uploadedPath)).toBe(false)

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('defaults to reading proposal.localPath from disk when readBytes is not injected', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'local-recording-rehost-test-'))
    const sourceDir = mkdtempSync(join(tmpdir(), 'local-recording-source-'))
    const sourcePath = join(sourceDir, 'dio5.wav')
    writeFileSync(sourcePath, 'real bytes on disk')

    const result = await rehostLocalRecording(proposal({ localPath: sourcePath }), {
      releaseExists: () => true,
      runGh: () => {},
      tmpDir,
    })

    expect(result.checksum).toMatch(/^sha256:[0-9a-f]{64}$/u)

    rmSync(tmpDir, { recursive: true, force: true })
    rmSync(sourceDir, { recursive: true, force: true })
  })
})
