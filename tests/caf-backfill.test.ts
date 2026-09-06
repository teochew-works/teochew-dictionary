import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GITHUB_REPO, type Audio } from '@teochew/core'
import { backfillCafOpus, tagFromClipUrl } from '../src/importers/caf-backfill.js'

const WEBM_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.webm`
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
    runGhCalls,
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

  it('--write: uploads the .caf asset into the same release tag and writes cafUrl/cafChecksum back', async () => {
    const path = join(dir, 'chaozhou.yaml')
    writeFileSync(path, stringify(audioTable({ dio5: [clip()] })))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    const result = await backfillCafOpus(path, audioTable({ dio5: [clip()] }), { write: true, ...tools })

    expect(result.backfilled).toEqual([
      { bucket: 'clips', key: 'dio5', index: 0, cafUrl: `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.caf` },
    ])
    expect(tools.runGhCalls).toEqual([
      ['release', 'upload', 'audio-chaozhou', expect.stringContaining('dio5.caf'), '--clobber'],
    ])

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].cafUrl).toBe(
      `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.caf`,
    )
    expect(written.clips.dio5[0].cafChecksum).toMatch(/^sha256:[0-9a-f]{64}$/u)
    // The source clip's own fields survive untouched alongside the new ones.
    expect(written.clips.dio5[0].url).toBe(WEBM_URL)
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
