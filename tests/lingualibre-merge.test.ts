import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GITHUB_REPO } from '../src/schema/phonology.js'
import { licenceSourceId, mergeLinguaLibreClip } from '../src/importers/lingualibre-merge.js'
import type { AudioClipProposal } from '../src/importers/audio-types.js'
import type { Source } from '../src/schema/entry.js'

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

function source(id: string, licence: string): Source {
  return { id, name: id, kind: 'import', licence }
}

// A fixture standing in for data/sources.yaml's real lingualibre* entries —
// keeps these tests independent of the shipped dataset (see tests/licence.test.ts).
const SOURCES: Source[] = [
  source('lingualibre', 'CC-BY-SA-4.0'),
  source('lingualibre-ccby4', 'CC-BY-4.0'),
  source('lingualibre-cc0', 'CC0'),
]

describe('licenceSourceId', () => {
  it('maps the category default to lingualibre', () => {
    expect(licenceSourceId('CC-BY-SA-4.0', SOURCES)).toBe('lingualibre')
  })

  it('normalises spacing/case before matching', () => {
    expect(licenceSourceId('cc by-sa 4.0', SOURCES)).toBe('lingualibre')
    expect(licenceSourceId('CC BY 4.0', SOURCES)).toBe('lingualibre-ccby4')
  })

  it('maps CC-BY-4.0 to lingualibre-ccby4', () => {
    expect(licenceSourceId('CC-BY-4.0', SOURCES)).toBe('lingualibre-ccby4')
  })

  it('maps CC0 to lingualibre-cc0', () => {
    expect(licenceSourceId('CC0', SOURCES)).toBe('lingualibre-cc0')
  })

  it('returns null for an unrecognised licence', () => {
    expect(licenceSourceId('All Rights Reserved', SOURCES)).toBeNull()
    expect(licenceSourceId('unknown', SOURCES)).toBeNull()
  })

  it('is data-driven: a new lingualibre* source with a matching licence is picked up with no code change', () => {
    const withNewVariant = [...SOURCES, source('lingualibre-ccbyncsa4', 'CC-BY-NC-SA-4.0')]
    expect(licenceSourceId('CC-BY-NC-SA-4.0', withNewVariant)).toBe('lingualibre-ccbyncsa4')
  })

  it('never matches a non-lingualibre source even if its licence string matches', () => {
    const withUnrelated = [...SOURCES, source('unihan', 'Unicode-DFS-2016')]
    expect(licenceSourceId('Unicode-DFS-2016', withUnrelated)).toBeNull()
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
    sources: SOURCES,
  }

  it('creates a new variety file and adds a single-syllable clip under clips', async () => {
    const result = await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })

    expect(result.bucket).toBe('clips')
    expect(result.key).toBe('dio5')
    expect(result.sourceId).toBe('lingualibre')
    expect(result.url).toBe(`https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/dio5.wav`)

    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.audio).toEqual({ id: 'chaozhou', variety: 'chaozhou' })
    expect(written.clips.dio5).toHaveLength(1)
    expect(written.clips.dio5[0]).toMatchObject({
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
    expect(written.clips.dio5[0].sources).toEqual(['lingualibre-cc0'])
  })

  it('records the uploadDate as recorded when present, and omits it otherwise', async () => {
    const withDate = await mergeLinguaLibreClip(proposal({ uploadDate: '2024-03-01' }), {
      variety: 'chaozhou',
      audioDir,
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(withDate.path, 'utf8'))
    expect(written.clips.dio5[0].recorded).toBe('2024-03-01')
    expect('recorded' in (parseYaml(readFileSync(withDate.path, 'utf8')).clips.dio5[0] ?? {})).toBe(true)

    rmSync(audioDir, { recursive: true, force: true })
    audioDir = mkdtempSync(join(tmpdir(), 'lingualibre-merge-test-'))
    const withoutDate = await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    const writtenNoDate = parseYaml(readFileSync(withoutDate.path, 'utf8'))
    expect('recorded' in writtenNoDate.clips.dio5[0]).toBe(false)
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

    const result = await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(Object.keys(written.clips).sort()).toEqual(['dio5', 'existing1'])
  })

  it('appends a distinct speaker as a second clip at an already-used key, without needing force (issue #134)', async () => {
    await mergeLinguaLibreClip(proposal({ speaker: 'First' }), { variety: 'chaozhou', audioDir, ...rehostOptions })
    const result = await mergeLinguaLibreClip(proposal({ speaker: 'Second' }), {
      variety: 'chaozhou',
      audioDir,
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5.map((c: { speaker: string }) => c.speaker).sort()).toEqual(['First', 'Second'])
  })

  it('refuses to overwrite the same speaker\'s existing clip at a key without force', async () => {
    await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    await expect(mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })).rejects.toThrow(
      /already has a clip/,
    )
  })

  it('replaces that speaker\'s existing clip in place when force is set — the list does not grow', async () => {
    await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    const result = await mergeLinguaLibreClip(proposal({ uploadDate: '2024-03-01' }), {
      variety: 'chaozhou',
      audioDir,
      force: true,
      ...rehostOptions,
    })
    const written = parseYaml(readFileSync(result.path, 'utf8'))
    expect(written.clips.dio5).toHaveLength(1)
    expect(written.clips.dio5[0].recorded).toBe('2024-03-01')
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
    expect(written.clips.dio5[0].confidence).toBe('medium')
  })

  it('does not mistake a pengim key matching an Object.prototype member name for an existing clip', async () => {
    // Plain bracket access (`existingBucket[key]`) would return the inherited
    // Object.prototype.constructor here and wrongly refuse as "already
    // merged" — this key was never actually written.
    const result = await mergeLinguaLibreClip(proposal({ pengim: 'constructor' }), {
      variety: 'chaozhou',
      audioDir,
      ...rehostOptions,
    })
    expect(result.key).toBe('constructor')
  })

  it('preserves a hand-written comment when merging a second clip into an existing file', async () => {
    // audioFileHeader's own text invites hand-editing an existing file —
    // round-tripping through a plain object would silently drop this.
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

    await mergeLinguaLibreClip(proposal(), { variety: 'chaozhou', audioDir, ...rehostOptions })
    expect(readFileSync(path, 'utf8')).toContain(handComment)
  })
})
