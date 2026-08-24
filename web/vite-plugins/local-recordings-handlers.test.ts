import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getStatus, saveRecording } from './local-recordings-handlers.js'
import { readLocalRecordingStaging } from '../../src/importers/local-recording-staging.js'

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
    expect(getStatus({ audioDir, stagingDir })).toEqual({ published: {}, pending: [] })
  })

  it('lists published clips with their playback url and speaker from the audio file', () => {
    writeFileSync(
      join(audioDir, 'chaozhou.yaml'),
      stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          dio5: [
            {
              url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5.wav',
              confidence: 'high',
              sources: ['x'],
              speaker: 'speaker-1',
              checksum: `sha256:${'a'.repeat(64)}`,
            },
          ],
        },
      }),
    )

    expect(getStatus({ audioDir, stagingDir }).published).toEqual({
      dio5: [
        {
          url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5.wav',
          speaker: 'speaker-1',
        },
      ],
    })
  })

  it('omits the speaker key entirely for a clip with no speaker', () => {
    writeFileSync(
      join(audioDir, 'chaozhou.yaml'),
      stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          dio5: [
            {
              url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5.wav',
              confidence: 'high',
              sources: ['x'],
              checksum: `sha256:${'a'.repeat(64)}`,
            },
          ],
        },
      }),
    )

    const [clip] = getStatus({ audioDir, stagingDir }).published.dio5 ?? []
    expect(clip).toEqual({
      url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5.wav',
    })
    expect(clip).not.toHaveProperty('speaker')
  })

  it('lists every clip at a key, one per speaker (issue #134)', () => {
    writeFileSync(
      join(audioDir, 'chaozhou.yaml'),
      stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          dio5: [
            {
              url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5-a.wav',
              confidence: 'high',
              sources: ['x'],
              speaker: 'speaker-1',
              checksum: `sha256:${'a'.repeat(64)}`,
            },
            {
              url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5-b.wav',
              confidence: 'low',
              sources: ['x'],
              speaker: 'speaker-2',
              checksum: `sha256:${'b'.repeat(64)}`,
            },
          ],
        },
      }),
    )

    expect(getStatus({ audioDir, stagingDir }).published.dio5).toEqual([
      {
        url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5-a.wav',
        speaker: 'speaker-1',
      },
      {
        url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5-b.wav',
        speaker: 'speaker-2',
      },
    ])
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

  it('replaces a pending proposal for the same syllable instead of appending a second one', () => {
    const paths: string[] = []
    const write = (path: string) => paths.push(path)
    saveRecording(validBody(), { recordingsDir, stagingDir, writeFile: write, idSuffix: () => 'first' })
    saveRecording(validBody(), { recordingsDir, stagingDir, writeFile: write, idSuffix: () => 'second' })

    // Both raw files were written under distinct names (still avoids a
    // filename collision)...
    expect(new Set(paths).size).toBe(2)

    // ...but only the newest proposal remains staged.
    const staged = readLocalRecordingStaging(stagingDir)
    expect(staged?.proposals).toHaveLength(1)
    expect(staged?.proposals[0]).toMatchObject({ pengim: 'dio5' })
    expect(staged?.proposals[0]?.localPath).toContain('second')
  })

  it('deletes the superseded take from disk when replacing a pending proposal', () => {
    // Uses the real filesystem writer (not the pushing-to-an-array spy the
    // other tests use) so the superseded file's deletion can be observed.
    saveRecording(validBody(), { recordingsDir, stagingDir, idSuffix: () => 'first' })
    saveRecording(validBody(), { recordingsDir, stagingDir, idSuffix: () => 'second' })

    expect(existsSync(join(recordingsDir, 'dio5__speaker-1__first.wav'))).toBe(false)
    expect(existsSync(join(recordingsDir, 'dio5__speaker-1__second.wav'))).toBe(true)
  })

  it('does not touch a proposal for a different pengim', () => {
    saveRecording(validBody({ pengim: 'dio5' }), { recordingsDir, stagingDir, idSuffix: () => 'first' })
    saveRecording(validBody({ pengim: 'ang1' }), { recordingsDir, stagingDir, idSuffix: () => 'second' })

    const staged = readLocalRecordingStaging(stagingDir)
    expect(staged?.proposals.map((p) => p.pengim)).toEqual(['dio5', 'ang1'])
    expect(existsSync(join(recordingsDir, 'dio5__speaker-1__first.wav'))).toBe(true)
    expect(existsSync(join(recordingsDir, 'ang1__speaker-1__second.wav'))).toBe(true)
  })

  it('creates the recordings directory if it does not exist yet', () => {
    const nested = join(recordingsDir, 'nested', 'dir')
    const result = saveRecording(validBody(), { recordingsDir: nested, stagingDir, idSuffix: () => 'x' })
    expect(result.ok).toBe(true)
    expect(readFileSync(join(nested, 'dio5__speaker-1__x.wav'))).toBeTruthy()
  })
})
