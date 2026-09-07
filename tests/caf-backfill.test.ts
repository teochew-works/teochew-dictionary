import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GITHUB_REPO, type Audio } from '@teochew/core'
import { GITHUB_RELEASE_ASSET_CAP, backfillCafOpus, tagFromClipUrl } from '../src/importers/caf-backfill.js'

const WEBM_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.webm`
const WEBM_URL_2 = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/ziu1.webm`
const WAV_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/legacy.wav`

function audioTable(clips: Audio['clips']): Audio {
  return { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips }
}

const clip = (overrides: Partial<Audio['clips'][string][number]> = {}) => ({
  url: WEBM_URL,
  confidence: 'high' as const,
  sources: ['fixture'],
  checksum: `sha256:${'a'.repeat(64)}`,
  ...overrides,
})

/** Fake external-tool hooks: no real ffmpeg/ffprobe/afconvert/gh — every step just proves the pipeline was invoked. */
function fakeTools(tmpDir: string) {
  const runGhCalls: string[][] = []
  const getAssetCountCalls: string[] = []
  return {
    tmpDir,
    fetchBytes: async () => Buffer.from('fake webm bytes'),
    runFfmpeg: (args: string[]) => writeFileSync(join(tmpDir, 'clip.wav'), 'fake wav'),
    runFfprobe: () => '140000',
    runAfconvert: (args: string[]) => writeFileSync(join(tmpDir, 'clip.caf'), 'fake caf'),
    releaseExists: () => true,
    runGh: (args: string[]) => {
      runGhCalls.push(args)
    },
    getAssetCount: (tag: string): number | null => {
      getAssetCountCalls.push(tag)
      return 0
    },
    runGhCalls,
    getAssetCountCalls,
  }
}

describe('tagFromClipUrl', () => {
  it('extracts the release tag from a download URL', () => {
    expect(tagFromClipUrl(WEBM_URL)).toBe('audio-chaozhou')
  })

  it('throws for a non-release-asset URL', () => {
    expect(() => tagFromClipUrl('https://example.com/clip.webm')).toThrow(/not a GitHub Release asset URL/)
  })
})

describe('backfillCafOpus', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caf-backfill-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('dry run: fetches and transcodes but uploads and writes nothing', async () => {
    const path = join(dir, 'chaozhou.yaml')
    writeFileSync(path, stringify(audioTable({ dio5: [clip()] })))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    const result = await backfillCafOpus(path, audioTable({ dio5: [clip()] }), { write: false, ...tools })

    expect(result.scanned).toBe(1)
    expect(result.backfilled).toHaveLength(1)
    expect(tools.runGhCalls).toEqual([])
    expect(parseYaml(readFileSync(path, 'utf8')).clips.dio5[0].cafUrl).toBeUndefined()
  })

  it('--write: uploads the .caf asset into a release dedicated to CAF assets, not the source webm release', async () => {
    const path = join(dir, 'chaozhou.yaml')
    writeFileSync(path, stringify(audioTable({ dio5: [clip()] })))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    const result = await backfillCafOpus(path, audioTable({ dio5: [clip()] }), { write: true, ...tools })

    const expectedUrl = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou-caf/audio-chaozhou-dio5.caf`
    expect(result.backfilled).toEqual([{ bucket: 'clips', key: 'dio5', index: 0, cafUrl: expectedUrl }])
    expect(tools.runGhCalls).toEqual([
      ['release', 'upload', 'audio-chaozhou-caf', expect.stringContaining('audio-chaozhou-dio5.caf'), '--clobber'],
    ])

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].cafUrl).toBe(expectedUrl)
    expect(written.clips.dio5[0].cafChecksum).toMatch(/^sha256:[0-9a-f]{64}$/u)
    // The source clip's own fields survive untouched alongside the new ones.
    expect(written.clips.dio5[0].url).toBe(WEBM_URL)
  })

  it('checks the CAF release once up front, not once per clip, when there is no need to roll over', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const table = audioTable({ dio5: [clip()], ziu1: [clip({ url: WEBM_URL_2 })] })
    writeFileSync(path, stringify(table))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    await backfillCafOpus(path, table, { write: true, ...tools })

    expect(tools.getAssetCountCalls).toEqual(['audio-chaozhou-caf'])
    expect(tools.runGhCalls).toHaveLength(2)
    expect(tools.runGhCalls.every((call) => call[2] === 'audio-chaozhou-caf')).toBe(true)
  })

  it('rolls over to the next numbered CAF release once GitHub\'s per-release asset cap is met (issue #228)', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const table = audioTable({ dio5: [clip()], ziu1: [clip({ url: WEBM_URL_2 })] })
    writeFileSync(path, stringify(table))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))
    tools.getAssetCount = (tag: string) => {
      tools.getAssetCountCalls.push(tag)
      return tag === 'audio-chaozhou-caf' ? GITHUB_RELEASE_ASSET_CAP : 0
    }

    const result = await backfillCafOpus(path, table, { write: true, ...tools })

    expect(tools.getAssetCountCalls).toEqual(['audio-chaozhou-caf', 'audio-chaozhou-caf-2'])
    expect(result.backfilled.map((b) => b.cafUrl)).toEqual([
      `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou-caf-2/audio-chaozhou-dio5.caf`,
      `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou-caf-2/audio-chaozhou-ziu1.caf`,
    ])
  })

  it('treats a nonexistent CAF release as empty, letting uploadBytesToRelease create it', async () => {
    const path = join(dir, 'chaozhou.yaml')
    writeFileSync(path, stringify(audioTable({ dio5: [clip()] })))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))
    tools.getAssetCount = () => null

    const result = await backfillCafOpus(path, audioTable({ dio5: [clip()] }), { write: true, ...tools })

    expect(result.backfilled).toHaveLength(1)
  })

  it('skips a clip that already has a cafUrl, without fetching it', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const already = clip({ cafUrl: 'https://github.com/x/y/releases/download/t/dio5.caf', cafChecksum: `sha256:${'b'.repeat(64)}` })
    writeFileSync(path, stringify(audioTable({ dio5: [already] })))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))
    let fetched = false
    tools.fetchBytes = async () => {
      fetched = true
      return Buffer.from('should not be called')
    }

    const result = await backfillCafOpus(path, audioTable({ dio5: [already] }), { write: true, ...tools })

    expect(result.skippedHasCaf).toBe(1)
    expect(result.backfilled).toEqual([])
    expect(fetched).toBe(false)
  })

  it('skips a clip whose url is not .webm — no CAF alternate needed', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const wavClip = clip({ url: WAV_URL })
    writeFileSync(path, stringify(audioTable({ dio5: [wavClip] })))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    const result = await backfillCafOpus(path, audioTable({ dio5: [wavClip] }), { write: true, ...tools })

    expect(result.skippedNotWebm).toBe(1)
    expect(result.backfilled).toEqual([])
  })

  it('preserves a hand-written comment when writing the backfilled fields', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const handComment = '# hand note: dio5 is a Chaoyang-accented recording, verify before reuse'
    writeFileSync(path, `${handComment}\n${stringify(audioTable({ dio5: [clip()] }))}`)
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    await backfillCafOpus(path, audioTable({ dio5: [clip()] }), { write: true, ...tools })

    expect(readFileSync(path, 'utf8')).toContain(handComment)
  })
})
