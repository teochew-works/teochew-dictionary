import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GITHUB_REPO } from '../src/schema/phonology.js'
import { licenceSourceId, mergeLinguaLibreClip } from '../src/importers/lingualibre-merge.js'
import type { AudioClipProposal } from '../src/importers/audio-types.js'

function proposal(overrides: Partial<AudioClipProposal> = {}): AudioClipProposal {
  return {
    pengim: 'dio5',
    syllableCount: 1,
    commonsTitle: 'File:LL-Q36759-Someone-dio5.wav',
    commonsUrl: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/LL-Q36759-Someone-dio5.wav',
    speaker: 'Someone',
    licence: 'CC-BY-SA-4.0',
    ...overrides,
  }
}

describe('licenceSourceId', () => {
  it('maps the category default to lingualibre', () => {
    expect(licenceSourceId('CC-BY-SA-4.0')).toBe('lingualibre')
  })

  it('normalises spacing/case before matching', () => {
    expect(licenceSourceId('cc by-sa 4.0')).toBe('lingualibre')
    expect(licenceSourceId('CC BY 4.0')).toBe('lingualibre-ccby4')
  })

  it('maps CC-BY-4.0 to lingualibre-ccby4', () => {
    expect(licenceSourceId('CC-BY-4.0')).toBe('lingualibre-ccby4')
  })

  it('maps CC0 to lingualibre-cc0', () => {
    expect(licenceSourceId('CC0')).toBe('lingualibre-cc0')
  })

  it('returns null for an unrecognised licence', () => {
    expect(licenceSourceId('All Rights Reserved')).toBeNull()
    expect(licenceSourceId('unknown')).toBeNull()
  })
})

describe('mergeLinguaLibreClip', () => {
  let audioDir: string

  beforeEach(() => {
    audioDir = mkdtempSync(join(tmpdir(), 'lingualibre-merge-test-'))
  })

  afterEach(() => {
    rmSync(audioDir, { recursive: true, force: true })
  })

  const rehostOptions = {
    fetchBytes: async () => Buffer.from('fake audio bytes'),
    releaseExists: () => true,
    runGh: () => {},
  }

  it('creates a new variety file and adds a single-syllable clip under clips', async () => {
    const result = await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })

    expect(result.bucket).toBe('clips')
    expect(result.key).toBe('dio5')
    expect(result.sourceId).toBe('lingualibre')
    expect(result.url).toBe(`https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/dio5.wav`)

    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.audio).toEqual({ id: 'chaozhou', variety: 'chaozhou' })
    expect(written.clips.dio5).toMatchObject({
      url: result.url,
      confidence: 'high',
      sources: ['lingualibre'],
      speaker: 'Someone',
    })
  })

  it('routes a multi-syllable proposal into wordClips', async () => {
    const result = await mergeLinguaLibreClip(proposal({ pengim: 'dio5 ziu1', syllableCount: 2 }), {
      variety: 'chaozhou',
      audioDir,
      ...rehostOptions,
    })

    expect(result.bucket).toBe('wordClips')
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.wordClips['dio5 ziu1']).toBeDefined()
    expect(written.clips ?? {}).toEqual({})
  })

  it('maps a CC0-reported licence to the lingualibre-cc0 source', async () => {
    const result = await mergeLinguaLibreClip(proposal({ licence: 'CC0' }), {
      variety: 'chaozhou',
      audioDir,
      ...rehostOptions,
    })
    expect(result.sourceId).toBe('lingualibre-cc0')

    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5.sources).toEqual(['lingualibre-cc0'])
  })

  it('records the uploadDate as recorded when present, and omits it otherwise', async () => {
    const withDate = await mergeLinguaLibreClip(proposal({ uploadDate: '2024-03-01' }), {
      variety: 'chaozhou',
      audioDir,
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(withDate.path, 'utf8'))
    expect(written.clips.dio5.recorded).toBe('2024-03-01')
    expect('recorded' in (parseYaml(readFileSync(withDate.path, 'utf8')).clips.dio5 ?? {})).toBe(true)

    rmSync(audioDir, { recursive: true, force: true })
    audioDir = mkdtempSync(join(tmpdir(), 'lingualibre-merge-test-'))
    const withoutDate = await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    const writtenNoDate = parseYaml(readFileSync(withoutDate.path, 'utf8'))
    expect('recorded' in writtenNoDate.clips.dio5).toBe(false)
  })

  it('preserves existing clips already in the file when adding a new one', async () => {
    const path = join(audioDir, 'chaozhou.yaml')
    writeFileSync(
      path,
      stringify({
        audio: { id: 'chaozhou', variety: 'chaozhou' },
        clips: {
          existing1: {
            url: `https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/existing1.wav`,
            confidence: 'high',
            sources: ['lingualibre'],
            checksum: `sha256:${'a'.repeat(64)}`,
          },
        },
      }),
    )

    const result = await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(Object.keys(written.clips).sort()).toEqual(['dio5', 'existing1'])
  })

  it('refuses to overwrite an existing key without force', async () => {
    await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    await expect(mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })).rejects.toThrow(
      /already has a clip/,
    )
  })

  it('overwrites an existing key when force is set', async () => {
    await mergeLinguaLibreClip(proposal({ speaker: 'First' }), { variety: 'chaozhou', audioDir, ...rehostOptions })
    const result = await mergeLinguaLibreClip(proposal({ speaker: 'Second' }), {
      variety: 'chaozhou',
      audioDir,
      force: true,
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5.speaker).toBe('Second')
  })

  it('rejects a proposal whose licence has no known source mapping', async () => {
    await expect(
      mergeLinguaLibreClip(proposal({ licence: 'All Rights Reserved' }), { variety: 'chaozhou', audioDir, ...rehostOptions }),
    ).rejects.toThrow(/no data\/sources\.yaml mapping/)
  })

  it('defaults confidence to high and accepts an override', async () => {
    const result = await mergeLinguaLibreClip(proposal(), {
      variety: 'chaozhou',
      audioDir,
      confidence: 'medium',
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5.confidence).toBe('medium')
  })
})
