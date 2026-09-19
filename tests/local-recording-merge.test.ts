import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, parseDocument, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { audioSchema, GITHUB_REPO, type AudioClip, type Source } from '@teochew/core'
import { mergeLocalRecording } from '../src/importers/local-recording-merge.js'
import { appendLocalRecordingProposal, readLocalRecordingStaging } from '../src/importers/local-recording-staging.js'
import type { LocalRecordingProposal } from '../src/importers/local-recording-types.js'
import { checksumBytes, type PutObjectParams } from '../src/importers/s3-upload.js'
import { checkAudio } from '../src/validate/index.js'

const CDN = 'https://daidb11aas52z.cloudfront.net/teochew/clips'

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

/** A clip already sitting in a fixture manifest — the shape a merge would have written earlier. */
function existingClip(overrides: Partial<AudioClip> & { url: string; checksum: string }): AudioClip {
  return {
    confidence: 'high',
    sources: ['teochew-dictionary-audio'],
    speaker: 'speaker-1',
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
    headObject: async () => undefined,
    putObject: async () => {},
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
    expect(result.url).toBe('https://daidb11aas52z.cloudfront.net/teochew/clips/speaker-1/dio5.wav')

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

  it('appends a distinct speaker as a second clip at an already-used key, without needing a flag (issue #134)', async () => {
    const base = { variety: 'chaozhou', audioDir, rootDir, ...rehostOptions }
    await mergeLocalRecording(proposal({ speaker: 'first-speaker' }), { ...base, readBytes: () => Buffer.from('x') })
    const result = await mergeLocalRecording(proposal({ speaker: 'second-speaker' }), {
      ...base,
      readBytes: () => Buffer.from('y'),
    })

    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5.map((c: AudioClip) => c.speaker).sort()).toEqual(['first-speaker', 'second-speaker'])
    // Each is alone in its own speaker's group, so both are implicitly
    // primary: no `take`, no `primary`, and today's asset path (ADR-0029).
    expect(result).toMatchObject({ disposition: 'appended-first', take: 1, primary: true })
    expect(written.clips.dio5.every((c: AudioClip) => c.take === undefined && c.primary === undefined)).toBe(true)
    expect(result.url).toBe(`${CDN}/second-speaker/dio5.wav`)
  })

  it('refuses to merge a proposal with no speaker resolved (issue #288: deferred assignment)', async () => {
    const { speaker: _speaker, ...withoutSpeaker } = proposal()
    await expect(
      mergeLocalRecording(withoutSpeaker as LocalRecordingProposal, {
        variety: 'chaozhou',
        audioDir,
        rootDir,
        readBytes: () => Buffer.from('x'),
        ...rehostOptions,
      }),
    ).rejects.toThrow(/has no speaker recorded/)
  })

  it('merges a proposal once a speaker is resolved onto it, even though the type allows it to be absent', async () => {
    const { speaker: _speaker, ...withoutSpeaker } = proposal()
    const result = await mergeLocalRecording(
      { ...(withoutSpeaker as LocalRecordingProposal), speaker: 'resolved-later' },
      { variety: 'chaozhou', audioDir, rootDir, readBytes: () => Buffer.from('x'), ...rehostOptions },
    )
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5[0].speaker).toBe('resolved-later')
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

  describe('takes (ADR-0029, issue #290)', () => {
    /** Merges `bytes` as `speaker`'s recording of dio5, with the S3 calls stubbed and every put recorded. */
    async function merge(
      bytes: string,
      overrides: { speaker?: string; primary?: boolean; recordedDate?: string } = {},
      puts: PutObjectParams[] = [],
    ) {
      const { primary, ...proposalOverrides } = overrides
      return mergeLocalRecording(proposal(proposalOverrides), {
        variety: 'chaozhou',
        audioDir,
        rootDir,
        primary,
        readBytes: () => Buffer.from(bytes),
        headObject: async () => undefined,
        putObject: async (params) => {
          puts.push(params)
        },
      })
    }

    const clipsAt = (path: string): AudioClip[] => parseYaml(readFileSync(path, 'utf8')).clips.dio5

    it('is a no-op when the same bytes are already merged at the key — nothing uploaded, nothing written', async () => {
      const first = await merge('same bytes')
      const before = readFileSync(first.path, 'utf8')

      const puts: PutObjectParams[] = []
      const again = await merge('same bytes', {}, puts)

      expect(again.disposition).toBe('already-merged')
      expect(again.take).toBe(1)
      expect(again.primary).toBe(true)
      expect(again.url).toBe(first.url)
      expect(puts).toEqual([])
      expect(readFileSync(first.path, 'utf8')).toBe(before)
    })

    it('reports an already-merged clip by another speaker too — identity is the checksum, not the speaker', async () => {
      await merge('shared bytes', { speaker: 'first-speaker' })
      const again = await merge('shared bytes', { speaker: 'second-speaker' })
      expect(again.disposition).toBe('already-merged')
      expect(clipsAt(again.path)).toHaveLength(1)
    })

    it('appends a second take as take 2 at its own asset path, and marks the existing clip primary in place', async () => {
      await merge('take one')
      const puts: PutObjectParams[] = []
      const result = await merge('take two', { recordedDate: '2026-08-24' }, puts)

      expect(result).toMatchObject({ disposition: 'appended-take', take: 2, primary: false })
      expect(puts[0]?.key).toBe('teochew/clips/speaker-1/dio5-take2.wav')
      expect(result.url).toBe(`${CDN}/speaker-1/dio5-take2.wav`)

      const clips = clipsAt(result.path)
      expect(clips).toHaveLength(2)
      // The group has just grown past one, so the validator now demands an
      // explicit primary — spliced into the clip that was implicitly it.
      expect(clips[0]).toMatchObject({ url: `${CDN}/speaker-1/dio5.wav`, primary: true })
      expect(clips[0]?.take).toBeUndefined()
      expect(clips[1]).toMatchObject({ take: 2, recorded: '2026-08-24' })
      expect(clips[1]?.primary).toBeUndefined()
    })

    it('leaves the existing markers alone for a third take, once a primary is explicit', async () => {
      await merge('take one')
      await merge('take two')
      const result = await merge('take three')

      expect(result).toMatchObject({ disposition: 'appended-take', take: 3, primary: false })
      const clips = clipsAt(result.path)
      expect(clips.map((c) => c.primary)).toEqual([true, undefined, undefined])
      expect(clips.map((c) => c.take)).toEqual([undefined, 2, 3])
    })

    it('moves the primary marker onto the new take under `primary`, clearing the old one', async () => {
      await merge('take one')
      await merge('take two')
      const result = await merge('take three', { primary: true })

      expect(result).toMatchObject({ disposition: 'appended-take', take: 3, primary: true })
      const clips = clipsAt(result.path)
      expect(clips.map((c) => c.primary)).toEqual([undefined, undefined, true])
      // Removed outright rather than written as `primary: false` — ADR-0029
      // gives the field no false state to say "not this one".
      expect('primary' in clips[0]!).toBe(false)
    })

    it('numbers a take over a gap: existing takes 1 and 3 give take 4, never a reused 2', async () => {
      // Takes are part of an immutable asset path and are never renumbered, so
      // a deleted take 2 must leave its number behind with its old object.
      writeFileSync(
        join(audioDir, 'chaozhou.yaml'),
        stringify({
          audio: { id: 'chaozhou', variety: 'chaozhou' },
          clips: {
            dio5: [
              existingClip({ url: `${CDN}/speaker-1/dio5.wav`, checksum: `sha256:${'a'.repeat(64)}`, primary: true }),
              existingClip({ url: `${CDN}/speaker-1/dio5-take3.wav`, checksum: `sha256:${'b'.repeat(64)}`, take: 3 }),
            ],
          },
        }),
      )

      const puts: PutObjectParams[] = []
      const result = await merge('a fourth take', {}, puts)
      expect(result.take).toBe(4)
      expect(puts[0]?.key).toBe('teochew/clips/speaker-1/dio5-take4.wav')
      expect(clipsAt(result.path)[2]).toMatchObject({ take: 4 })
    })

    it('ignores an ADR-0027 render at the key when sizing the speaker\'s group, and leaves it untouched', async () => {
      const recordingChecksum = `sha256:${'a'.repeat(64)}`
      writeFileSync(
        join(audioDir, 'chaozhou.yaml'),
        stringify({
          audio: { id: 'chaozhou', variety: 'chaozhou' },
          clips: {
            dio5: [
              existingClip({ url: `${CDN}/speaker-1/dio5.wav`, checksum: recordingChecksum }),
              existingClip({
                url: `${CDN}/speaker-1-n/dio5.webm`,
                checksum: `sha256:${'b'.repeat(64)}`,
                speaker: 'speaker-1-n',
                confidence: 'medium',
                synthesis: 'world-retune',
                derivedFrom: recordingChecksum,
              }),
            ],
          },
        }),
      )

      const result = await merge('a real second take')
      // Take 2, not 3: the render is a derived tier under its own speaker id,
      // never one of speaker-1's takes.
      expect(result.take).toBe(2)

      const clips = clipsAt(result.path)
      expect(clips).toHaveLength(3)
      expect(clips[0]).toMatchObject({ primary: true })
      expect(clips[1]).toMatchObject({ speaker: 'speaker-1-n', synthesis: 'world-retune' })
      expect(clips[1]?.primary).toBeUndefined()
    })

    it('leaves every other entry in the manifest byte-identical when appending a take', async () => {
      // The real chaozhou.yaml is 4 MB of hand-formatted flow-style YAML whose
      // own header invites hand-editing a clip, so a merge must touch one key
      // and nothing else. Compared against the document's own round-trip
      // rather than the source text: `yaml` re-emits the whole document on
      // every write, so "unchanged" can only mean "identical to what writing
      // it back without any edit would have produced".
      const path = join(audioDir, 'chaozhou.yaml')
      const source = [
        '# Audio clip metadata for the \'chaozhou\' variety.',
        'audio:',
        '  id: chaozhou',
        '  variety: chaozhou',
        'clips:',
        '  {',
        '    ang1:',
        '      [',
        `        { url: ${CDN}/speaker-1/ang1.wav, confidence: high, sources: [ teochew-dictionary-audio ], speaker: speaker-1, checksum: sha256:${'c'.repeat(64)} },`,
        '      ],',
        '    dio5:',
        '      [',
        `        { url: ${CDN}/speaker-1/dio5.wav, confidence: high, sources: [ teochew-dictionary-audio ], speaker: speaker-1, checksum: sha256:${'a'.repeat(64)} },`,
        '      ],',
        '    # hand note: ziu1 is a Chaoyang-accented recording, verify before reuse',
        '    ziu1:',
        '      [',
        `        { url: ${CDN}/speaker-1/ziu1.wav, confidence: high, sources: [ teochew-dictionary-audio ], speaker: speaker-1, checksum: sha256:${'d'.repeat(64)} },`,
        '      ],',
        '  }',
        '',
      ].join('\n')
      writeFileSync(path, source)

      const baseline = parseDocument(source).toString()
      await merge('a second take')
      const after = readFileSync(path, 'utf8')

      const before = (text: string): string => text.slice(0, text.indexOf('dio5:'))
      const following = (text: string): string => text.slice(text.indexOf('ziu1:'))
      expect(before(after)).toBe(before(baseline))
      expect(following(after)).toBe(following(baseline))
      expect(after).toContain('# hand note: ziu1 is a Chaoyang-accented recording, verify before reuse')
    })

    it('produces a manifest that passes the validator (checkAudio), takes and all', async () => {
      await merge('take one')
      await merge('take two')
      const result = await merge('take three', { primary: true })
      await mergeLocalRecording(proposal({ speaker: 'speaker-2' }), {
        variety: 'chaozhou',
        audioDir,
        rootDir,
        readBytes: () => Buffer.from('another speaker entirely'),
        headObject: async () => undefined,
        putObject: async () => {},
      })

      const parsed = audioSchema.parse(parseYaml(readFileSync(result.path, 'utf8')))
      const sourceMap = new Map<string, Source>([
        [
          'teochew-dictionary-audio',
          { id: 'teochew-dictionary-audio', name: 'Teochew Dictionary audio', kind: 'import', licence: 'CC-BY-4.0' },
        ],
      ])
      const issues = checkAudio(
        'data/phonology/audio/chaozhou.yaml',
        parsed,
        'chaozhou',
        new Set(['chaozhou']),
        sourceMap,
        new Set(['dio5']),
      )
      expect(issues).toEqual([])
    })
  })

  describe('--dry-run (issue #290: previewing the 414-take staging backlog)', () => {
    let stagingDir: string

    beforeEach(() => {
      stagingDir = mkdtempSync(join(tmpdir(), 'local-recording-merge-dry-run-staging-'))
    })

    afterEach(() => {
      rmSync(stagingDir, { recursive: true, force: true })
    })

    it('performs no putObject, leaves the manifest byte-identical, and leaves staging untouched', async () => {
      const path = join(audioDir, 'chaozhou.yaml')
      const manifest = stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          dio5: [existingClip({ url: `${CDN}/speaker-1/dio5.wav`, checksum: `sha256:${'a'.repeat(64)}` })],
        },
      })
      writeFileSync(path, manifest)

      const localAbsPath = join(rootDir, 'recordings/chaozhou/dio5.wav')
      mkdirSync(join(rootDir, 'recordings/chaozhou'), { recursive: true })
      writeFileSync(localAbsPath, 'a second take')

      const p = proposal({ localPath: 'recordings/chaozhou/dio5.wav' })
      appendLocalRecordingProposal(p, stagingDir)

      const puts: PutObjectParams[] = []
      const result = await mergeLocalRecording(p, {
        variety: 'chaozhou',
        audioDir,
        rootDir,
        stagingDir,
        proposalIndex: 0,
        dryRun: true,
        readBytes: () => Buffer.from('a second take'),
        headObject: async () => undefined,
        putObject: async (params) => {
          puts.push(params)
        },
      })

      expect(puts).toEqual([])
      expect(readFileSync(path, 'utf8')).toBe(manifest)
      expect(readLocalRecordingStaging(stagingDir)?.proposals).toHaveLength(1)
      expect(existsSync(localAbsPath)).toBe(true)
      expect(result).toMatchObject({ disposition: 'appended-take', take: 2, primary: false })
      expect(result.url).toBe(`${CDN}/speaker-1/dio5-take2.wav`)
    })

    it('returns the same disposition, take, primary, checksum and url a real merge would', async () => {
      const path = join(audioDir, 'chaozhou.yaml')
      const manifest = stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          dio5: [existingClip({ url: `${CDN}/speaker-1/dio5.wav`, checksum: `sha256:${'a'.repeat(64)}` })],
        },
      })
      writeFileSync(path, manifest)

      const base = {
        variety: 'chaozhou',
        audioDir,
        rootDir,
        readBytes: () => Buffer.from('a real second take'),
        headObject: async () => undefined,
        putObject: async () => {},
      }

      const dryResult = await mergeLocalRecording(proposal(), { ...base, dryRun: true })
      // The dry run above must not have touched the manifest — otherwise the
      // "real" merge below would be planning against the dry run's own effect.
      expect(readFileSync(path, 'utf8')).toBe(manifest)

      const realResult = await mergeLocalRecording(proposal(), base)

      expect(dryResult).toMatchObject({
        disposition: realResult.disposition,
        take: realResult.take,
        primary: realResult.primary,
        checksum: realResult.checksum,
      })
      expect(dryResult.url).toBe(realResult.url)
    })

    it('reports already-merged and still cleans up nothing when the bytes are already published', async () => {
      const existingChecksum = checksumBytes(Buffer.from('same bytes'))
      const path = join(audioDir, 'chaozhou.yaml')
      const manifest = stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          dio5: [existingClip({ url: `${CDN}/speaker-1/dio5.wav`, checksum: existingChecksum })],
        },
      })
      writeFileSync(path, manifest)

      const localAbsPath = join(rootDir, 'recordings/chaozhou/dio5.wav')
      mkdirSync(join(rootDir, 'recordings/chaozhou'), { recursive: true })
      writeFileSync(localAbsPath, 'same bytes')

      const p = proposal({ localPath: 'recordings/chaozhou/dio5.wav' })
      appendLocalRecordingProposal(p, stagingDir)

      const result = await mergeLocalRecording(p, {
        variety: 'chaozhou',
        audioDir,
        rootDir,
        stagingDir,
        proposalIndex: 0,
        dryRun: true,
        readBytes: () => Buffer.from('same bytes'),
        headObject: async () => undefined,
        putObject: async () => {
          throw new Error('must not upload in a dry run')
        },
      })

      expect(result).toMatchObject({ disposition: 'already-merged', take: 1, primary: true, url: `${CDN}/speaker-1/dio5.wav` })
      expect(readFileSync(path, 'utf8')).toBe(manifest)
      expect(readLocalRecordingStaging(stagingDir)?.proposals).toHaveLength(1)
      expect(existsSync(localAbsPath)).toBe(true)
    })

    it('threads simulatedList across a batch so takes preview as 2, 3, 4 rather than repeating', async () => {
      const path = join(audioDir, 'chaozhou.yaml')
      writeFileSync(
        path,
        stringify({
          audio: { id: 'chaozhou', variety: 'chaozhou' },
          clips: {
            dio5: [existingClip({ url: `${CDN}/speaker-1/dio5.wav`, checksum: `sha256:${'a'.repeat(64)}` })],
          },
        }),
      )

      let existingListOverride: AudioClip[] | undefined
      const takes: number[] = []
      for (const bytes of ['take two', 'take three', 'take four']) {
        const result = await mergeLocalRecording(proposal(), {
          variety: 'chaozhou',
          audioDir,
          rootDir,
          dryRun: true,
          existingListOverride,
          readBytes: () => Buffer.from(bytes),
          headObject: async () => undefined,
          putObject: async () => {},
        })
        existingListOverride = result.simulatedList
        takes.push(result.take)
      }

      expect(takes).toEqual([2, 3, 4])
      // Nothing was ever written — the manifest still shows only the
      // original clip the batch started from.
      expect(parseYaml(readFileSync(path, 'utf8')).clips.dio5).toHaveLength(1)
    })

    it('previews takes 1, 2, 3 for a brand-new speaker with nothing published yet', async () => {
      let existingListOverride: AudioClip[] | undefined
      const takes: number[] = []
      for (const bytes of ['a', 'b', 'c']) {
        const result = await mergeLocalRecording(proposal({ speaker: 'new-speaker' }), {
          variety: 'chaozhou',
          audioDir,
          rootDir,
          dryRun: true,
          existingListOverride,
          readBytes: () => Buffer.from(bytes),
          headObject: async () => undefined,
          putObject: async () => {},
        })
        existingListOverride = result.simulatedList
        takes.push(result.take)
      }

      expect(takes).toEqual([1, 2, 3])
      expect(existsSync(join(audioDir, 'chaozhou.yaml'))).toBe(false)
    })
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

    it('still clears staging when the bytes turn out to be already merged (a resumed run)', async () => {
      const localAbsPath = join(rootDir, 'recordings/chaozhou/dio5.wav')
      mkdirSync(join(rootDir, 'recordings/chaozhou'), { recursive: true })
      writeFileSync(localAbsPath, 'real bytes')

      const p = proposal({ localPath: 'recordings/chaozhou/dio5.wav' })
      const base = { variety: 'chaozhou', audioDir, rootDir, stagingDir, ...rehostOptions }
      await mergeLocalRecording(p, base)

      // Same bytes, staged again (or a cleanup interrupted last time): the
      // clip is published, so the staged copy is redundant either way.
      appendLocalRecordingProposal(p, stagingDir)
      const result = await mergeLocalRecording(p, { ...base, proposalIndex: 0 })

      expect(result.disposition).toBe('already-merged')
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
