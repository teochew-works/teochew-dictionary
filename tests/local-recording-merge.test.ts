import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GITHUB_REPO } from '../src/schema/phonology.js'
import { mergeLocalRecording } from '../src/importers/local-recording-merge.js'
import { appendLocalRecordingProposal, readLocalRecordingStaging } from '../src/importers/local-recording-staging.js'
import type { LocalRecordingProposal } from '../src/importers/local-recording-types.js'

function proposal(overrides: Partial<LocalRecordingProposal> = {}): LocalRecordingProposal {
  return {
    pengim: 'dio5',
    syllableCount: 1,
    localPath: 'recordings/chaozhou/dio5__speaker-1__20260823.wav',
    speaker: 'speaker-1',
    recordedDate: '2026-08-23',
    consentAcknowledged: true,
    variety: 'chaozhou',
    ...overrides,
  }
}

describe('mergeLocalRecording', () => {
  let audioDir: string
  let rootDir: string

  beforeEach(() => {
    audioDir = mkdtempSync(join(tmpdir(), 'local-recording-merge-audio-'))
    rootDir = mkdtempSync(join(tmpdir(), 'local-recording-merge-root-'))
  })

  afterEach(() => {
    rmSync(audioDir, { recursive: true, force: true })
    rmSync(rootDir, { recursive: true, force: true })
  })

  const rehostOptions = {
    releaseExists: () => true,
    runGh: () => {},
  }

  it('creates a new variety file and adds a single-syllable clip under clips', async () => {
    const result = await mergeLocalRecording(proposal(), {
      variety: 'chaozhou',
      audioDir,
      rootDir,
      readBytes: () => Buffer.from('fake audio bytes'),
      ...rehostOptions,
    })

    expect(result.key).toBe('dio5')
    expect(result.url).toBe(`https://github.com/${GITHUB_REPO}/releases/download/audio-teochew-dictionary-audio/dio5.wav`)

    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.audio).toEqual({ id: 'chaozhou', variety: 'chaozhou' })
    expect(written.clips.dio5).toHaveLength(1)
    expect(written.clips.dio5[0]).toMatchObject({
      url: result.url,
      confidence: 'high',
      sources: ['teochew-dictionary-audio'],
      speaker: 'speaker-1',
      recorded: '2026-08-23',
    })
  })

  it('reads the proposal bytes from rootDir/localPath when readBytes is not injected', async () => {
    const localAbsPath = join(rootDir, proposal().localPath)
    mkdirSync(join(rootDir, 'recordings/chaozhou'), { recursive: true })
    writeFileSync(localAbsPath, 'real bytes')

    const result = await mergeLocalRecording(proposal(), { variety: 'chaozhou', audioDir, rootDir, ...rehostOptions })
    expect(result.checksum).toMatch(/^sha256:[0-9a-f]{64}$/u)
  })

  it('preserves existing clips already in the file when adding a new one', async () => {
    const path = join(audioDir, 'chaozhou.yaml')
    writeFileSync(
      path,
      stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          existing1: [
            {
              url: `https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/existing1.wav`,
              confidence: 'high',
              sources: ['lingualibre'],
              checksum: `sha256:${'a'.repeat(64)}`,
            },
          ],
        },
      }),
    )

    const result = await mergeLocalRecording(proposal(), {
      variety: 'chaozhou',
      audioDir,
      rootDir,
      readBytes: () => Buffer.from('x'),
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(Object.keys(written.clips).sort()).toEqual(['dio5', 'existing1'])
  })

  it('appends a distinct speaker as a second clip at an already-used key, without needing force (issue #134)', async () => {
    const base = { variety: 'chaozhou', audioDir, rootDir, readBytes: () => Buffer.from('x'), ...rehostOptions }
    await mergeLocalRecording(proposal({ speaker: 'first-speaker' }), base)
    const result = await mergeLocalRecording(proposal({ speaker: 'second-speaker' }), base)
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5.map((c: { speaker: string }) => c.speaker).sort()).toEqual([
      'first-speaker',
      'second-speaker',
    ])
  })

  it('refuses to overwrite the same speaker\'s existing clip at a key without force', async () => {
    const opts = { variety: 'chaozhou', audioDir, rootDir, readBytes: () => Buffer.from('x'), ...rehostOptions }
    await mergeLocalRecording(proposal(), opts)
    await expect(mergeLocalRecording(proposal(), opts)).rejects.toThrow(/already has a clip/)
  })

  it('replaces that speaker\'s existing clip in place when force is set — the list does not grow', async () => {
    const base = { variety: 'chaozhou', audioDir, rootDir, readBytes: () => Buffer.from('x'), ...rehostOptions }
    await mergeLocalRecording(proposal(), base)
    const result = await mergeLocalRecording(proposal({ recordedDate: '2026-08-24' }), { ...base, force: true })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5).toHaveLength(1)
    expect(written.clips.dio5[0].recorded).toBe('2026-08-24')
  })

  it('defaults confidence to high and accepts an override', async () => {
    const result = await mergeLocalRecording(proposal(), {
      variety: 'chaozhou',
      audioDir,
      rootDir,
      confidence: 'medium',
      readBytes: () => Buffer.from('x'),
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5[0].confidence).toBe('medium')
  })

  it('preserves a hand-written comment when merging a second clip into an existing file', async () => {
    const path = join(audioDir, 'chaozhou.yaml')
    const handComment = '# hand note: existing1 is a Chaoyang-accented recording, verify before reuse'
    writeFileSync(
      path,
      `${handComment}\n${stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          existing1: [
            {
              url: `https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/existing1.wav`,
              confidence: 'high',
              sources: ['lingualibre'],
              checksum: `sha256:${'a'.repeat(64)}`,
            },
          ],
        },
      })}`,
    )

    await mergeLocalRecording(proposal(), {
      variety: 'chaozhou',
      audioDir,
      rootDir,
      readBytes: () => Buffer.from('x'),
      ...rehostOptions,
    })
    expect(readFileSync(path, 'utf8')).toContain(handComment)
  })

  describe('cleanup when proposalIndex is given', () => {
    let stagingDir: string

    beforeEach(() => {
      stagingDir = mkdtempSync(join(tmpdir(), 'local-recording-merge-staging-'))
    })

    afterEach(() => {
      rmSync(stagingDir, { recursive: true, force: true })
    })

    it('removes the staged proposal and the local recording file on success', async () => {
      const localAbsPath = join(rootDir, 'recordings/chaozhou/dio5.wav')
      mkdirSync(join(rootDir, 'recordings/chaozhou'), { recursive: true })
      writeFileSync(localAbsPath, 'real bytes')

      const p = proposal({ localPath: 'recordings/chaozhou/dio5.wav' })
      appendLocalRecordingProposal(p, stagingDir)

      await mergeLocalRecording(p, {
        variety: 'chaozhou',
        audioDir,
        rootDir,
        stagingDir,
        proposalIndex: 0,
        ...rehostOptions,
      })

      expect(readLocalRecordingStaging(stagingDir)?.proposals).toHaveLength(0)
      expect(existsSync(localAbsPath)).toBe(false)
    })

    it('leaves the staged proposal and local file alone when proposalIndex is omitted', async () => {
      const localAbsPath = join(rootDir, 'recordings/chaozhou/dio5.wav')
      mkdirSync(join(rootDir, 'recordings/chaozhou'), { recursive: true })
      writeFileSync(localAbsPath, 'real bytes')

      const p = proposal({ localPath: 'recordings/chaozhou/dio5.wav' })
      appendLocalRecordingProposal(p, stagingDir)

      await mergeLocalRecording(p, { variety: 'chaozhou', audioDir, rootDir, stagingDir, ...rehostOptions })

      expect(readLocalRecordingStaging(stagingDir)?.proposals).toHaveLength(1)
      expect(existsSync(localAbsPath)).toBe(true)
    })
  })
})
