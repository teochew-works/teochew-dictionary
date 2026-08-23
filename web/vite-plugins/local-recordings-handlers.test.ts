import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getStatus, saveRecording } from './local-recordings-handlers.js'

describe('getStatus', () => {
  let audioDir: string
  let stagingDir: string

  beforeEach(() => {
    audioDir = mkdtempSync(join(tmpdir(), 'local-recordings-status-audio-'))
    stagingDir = mkdtempSync(join(tmpdir(), 'local-recordings-status-staging-'))
  })

  afterEach(() => {
    rmSync(audioDir, { recursive: true, force: true })
    rmSync(stagingDir, { recursive: true, force: true })
  })

  it('reports no published or pending clips when nothing exists yet', () => {
    expect(getStatus({ audioDir, stagingDir })).toEqual({ published: [], pending: [] })
  })

  it('lists published clip keys from the audio file', () => {
    writeFileSync(
      join(audioDir, 'chaozhou.yaml'),
      stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          dio5: {
            url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5.wav',
            confidence: 'high',
            sources: ['x'],
            checksum: `sha256:${'a'.repeat(64)}`,
          },
        },
      }),
    )

    expect(getStatus({ audioDir, stagingDir }).published).toEqual(['dio5'])
  })

  it('lists pending syllables from staged proposals for this variety only', () => {
    writeFileSync(
      join(stagingDir, 'teochew-dictionary-audio.yaml'),
      stringify({
        source: 'teochew-dictionary-audio',
        proposals: [
          { pengim: 'ang1', syllableCount: 1, localPath: 'x.wav', speaker: 's', recordedDate: '2026-08-23', consentAcknowledged: true, variety: 'chaozhou' },
          { pengim: 'bhi2', syllableCount: 1, localPath: 'y.wav', speaker: 's', recordedDate: '2026-08-23', consentAcknowledged: true, variety: 'chaoyang' },
        ],
      }),
    )

    expect(getStatus({ audioDir, stagingDir }).pending).toEqual(['ang1'])
  })
})

describe('saveRecording', () => {
  let recordingsDir: string
  let stagingDir: string

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      pengim: 'dio5',
      speaker: 'speaker-1',
      recordedDate: '2026-08-23',
      consentAcknowledged: true,
      audioBase64: Buffer.from('fake audio bytes').toString('base64'),
      mimeType: 'audio/wav',
      ...overrides,
    }
  }

  beforeEach(() => {
    recordingsDir = mkdtempSync(join(tmpdir(), 'local-recordings-save-audio-'))
    stagingDir = mkdtempSync(join(tmpdir(), 'local-recordings-save-staging-'))
  })

  afterEach(() => {
    rmSync(recordingsDir, { recursive: true, force: true })
    rmSync(stagingDir, { recursive: true, force: true })
  })

  it('writes the decoded bytes and stages a proposal on a valid request', () => {
    const written: { path: string; bytes: Buffer }[] = []
    const result = saveRecording(validBody(), {
      recordingsDir,
      stagingDir,
      idSuffix: () => 'fixedid',
      writeFile: (path, bytes) => written.push({ path, bytes }),
    })

    expect(result).toEqual({ ok: true, localPath: expect.stringContaining('dio5__speaker-1__fixedid.wav') })
    expect(written).toHaveLength(1)
    expect(written[0]?.bytes.toString()).toBe('fake audio bytes')
    expect(written[0]?.path).toBe(join(recordingsDir, 'dio5__speaker-1__fixedid.wav'))
  })

  it.each([
    ['audio/webm', '.webm'],
    ['audio/wav', '.wav'],
    ['audio/mp4', '.m4a'],
  ])('maps %s to the %s extension', (mimeType, ext) => {
    const result = saveRecording(validBody({ mimeType }), { recordingsDir, stagingDir, idSuffix: () => 'x', writeFile: () => {} })
    expect(result.ok).toBe(true)
    expect(result.ok && result.localPath.endsWith(ext)).toBe(true)
  })

  it('strips a codec suffix before matching the mimeType (e.g. MediaRecorder reporting audio/webm;codecs=opus)', () => {
    const result = saveRecording(validBody({ mimeType: 'audio/webm;codecs=opus' }), {
      recordingsDir,
      stagingDir,
      idSuffix: () => 'x',
      writeFile: () => {},
    })
    expect(result).toEqual({ ok: true, localPath: expect.stringContaining('.webm') })
  })

  it('rejects an unsupported mimeType', () => {
    const result = saveRecording(validBody({ mimeType: 'video/mp4' }), { recordingsDir, stagingDir })
    expect(result).toEqual({ ok: false, error: "unsupported mimeType 'video/mp4'" })
  })

  it('rejects when consentAcknowledged is not exactly true', () => {
    expect(saveRecording(validBody({ consentAcknowledged: false }), { recordingsDir, stagingDir }).ok).toBe(false)
    expect(saveRecording(validBody({ consentAcknowledged: 'true' }), { recordingsDir, stagingDir }).ok).toBe(false)
    expect(saveRecording(validBody({ consentAcknowledged: undefined }), { recordingsDir, stagingDir }).ok).toBe(false)
  })

  it('rejects a missing or blank pengim', () => {
    expect(saveRecording(validBody({ pengim: '' }), { recordingsDir, stagingDir })).toEqual({ ok: false, error: 'pengim is required' })
    expect(saveRecording(validBody({ pengim: undefined }), { recordingsDir, stagingDir })).toEqual({ ok: false, error: 'pengim is required' })
  })

  it('rejects a missing or blank speaker', () => {
    expect(saveRecording(validBody({ speaker: '  ' }), { recordingsDir, stagingDir })).toEqual({ ok: false, error: 'speaker is required' })
  })

  it('rejects a malformed recordedDate', () => {
    expect(saveRecording(validBody({ recordedDate: '23-08-2026' }), { recordingsDir, stagingDir }).ok).toBe(false)
  })

  it('rejects empty audioBase64', () => {
    expect(saveRecording(validBody({ audioBase64: '' }), { recordingsDir, stagingDir })).toEqual({
      ok: false,
      error: 'audioBase64 is required',
    })
  })

  it('does not write anything when validation fails', () => {
    const written: unknown[] = []
    saveRecording(validBody({ consentAcknowledged: false }), {
      recordingsDir,
      stagingDir,
      writeFile: (path, bytes) => written.push({ path, bytes }),
    })
    expect(written).toHaveLength(0)
  })

  it('appends a proposal readable back via getStatus', () => {
    saveRecording(validBody(), { recordingsDir, stagingDir, idSuffix: () => 'x', writeFile: () => {} })
    const audioDir = mkdtempSync(join(tmpdir(), 'local-recordings-save-audiodir-'))
    try {
      expect(getStatus({ audioDir, stagingDir }).pending).toEqual(['dio5'])
    } finally {
      rmSync(audioDir, { recursive: true, force: true })
    }
  })

  it('uses a distinct id per call so re-recording the same syllable does not collide', () => {
    const paths: string[] = []
    const write = (path: string) => paths.push(path)
    saveRecording(validBody(), { recordingsDir, stagingDir, writeFile: write })
    saveRecording(validBody(), { recordingsDir, stagingDir, writeFile: write })
    expect(new Set(paths).size).toBe(2)
  })

  it('creates the recordings directory if it does not exist yet', () => {
    const nested = join(recordingsDir, 'nested', 'dir')
    const result = saveRecording(validBody(), { recordingsDir: nested, stagingDir, idSuffix: () => 'x' })
    expect(result.ok).toBe(true)
    expect(readFileSync(join(nested, 'dio5__speaker-1__x.wav'))).toBeTruthy()
  })
})
