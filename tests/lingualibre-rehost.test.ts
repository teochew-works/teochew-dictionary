import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GITHUB_REPO } from '../src/schema/phonology.js'
import { assetFilename, rehostClip, resolveProposal } from '../src/importers/lingualibre-rehost.js'
import type { AudioClipProposal } from '../src/importers/audio-types.js'

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
  it('hyphenates a multi-syllable pengim key and keeps the source extension', () => {
    expect(assetFilename(proposal({ pengim: 'dio5 ziu1', commonsUrl: '.../x.wav' }))).toBe('dio5-ziu1.wav')
  })

  it('lowercases the key', () => {
    expect(assetFilename(proposal({ pengim: 'Dio5', commonsUrl: '.../x.WAV' }))).toBe('dio5.wav')
  })

  it('falls back to .wav when the source url has no recognisable extension', () => {
    expect(assetFilename(proposal({ pengim: 'dio5', commonsUrl: 'https://example.com/no-extension' }))).toBe(
      'dio5.wav',
    )
  })
})

describe('rehostClip', () => {
  it('downloads, checksums, and uploads via the injected gh runner, returning a GitHub Release URL', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'lingualibre-rehost-test-'))
    const ghCalls: string[][] = []
    const bytes = Buffer.from('fake audio bytes')

    const result = await rehostClip(proposal(), {
      tag: 'audio-lingualibre-test',
      fetchBytes: async () => bytes,
      releaseExists: () => true,
      runGh: (args) => ghCalls.push(args),
      tmpDir,
    })

    expect(ghCalls).toEqual([
      ['release', 'upload', 'audio-lingualibre-test', join(tmpDir, 'dio5-ziu1.wav'), '--clobber'],
    ])
    expect(result.url).toBe(
      `https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre-test/dio5-ziu1.wav`,
    )
    expect(result.checksum).toMatch(/^sha256:[0-9a-f]{64}$/u)

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("creates the release first when it doesn't exist yet, then uploads", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'lingualibre-rehost-test-'))
    const ghCalls: string[][] = []

    await rehostClip(proposal(), {
      tag: 'audio-lingualibre-test',
      fetchBytes: async () => Buffer.from('x'),
      releaseExists: () => false,
      runGh: (args) => ghCalls.push(args),
      tmpDir,
    })

    expect(ghCalls[0]).toEqual([
      'release',
      'create',
      'audio-lingualibre-test',
      '--title',
      'audio-lingualibre-test',
      '--notes',
      'Re-hosted Lingua Libre/Commons audio clips — see data/phonology/REVIEW.md § 16.',
    ])
    expect(ghCalls[1]?.[1]).toBe('upload')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('removes the local temp file after uploading', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'lingualibre-rehost-test-'))
    let localPath = ''

    await rehostClip(proposal(), {
      fetchBytes: async () => Buffer.from('x'),
      releaseExists: () => true,
      runGh: (args) => {
        localPath = args[2] ?? ''
      },
      tmpDir,
    })

    expect(localPath).not.toBe('')
    expect(existsSync(localPath)).toBe(false)

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
