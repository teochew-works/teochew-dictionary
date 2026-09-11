import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Audio } from '@teochew/core'
import { backfillCafOpus } from '../src/importers/caf-backfill.js'
import { AUDIO_CDN_BASE } from '../src/importers/s3-upload.js'
import type { PutObjectParams } from '../src/importers/s3-upload.js'

const WEBM_URL = `${AUDIO_CDN_BASE}/clips/dio5-jky.webm`
const WEBM_URL_2 = `${AUDIO_CDN_BASE}/clips/ziu1-jky.webm`
const WAV_URL = `${AUDIO_CDN_BASE}/clips/legacy-jky.wav`

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

/** Fake external-tool hooks: no real ffmpeg/ffprobe/afconvert/AWS — every step just proves the pipeline was invoked. */
function fakeTools(tmpDir: string) {
  const putCalls: PutObjectParams[] = []
  return {
    tmpDir,
    fetchBytes: async () => Buffer.from('fake webm bytes'),
    runFfmpeg: () => writeFileSync(join(tmpDir, 'clip.wav'), 'fake wav'),
    runFfprobe: () => '140000',
    runAfconvert: () => writeFileSync(join(tmpDir, 'clip.caf'), 'fake caf'),
    headObject: async () => undefined,
    putObject: async (params: PutObjectParams) => {
      putCalls.push(params)
    },
    putCalls,
  }
}

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
    expect(tools.putCalls).toEqual([])
    expect(parseYaml(readFileSync(path, 'utf8')).clips.dio5[0].cafUrl).toBeUndefined()
  })

  it('--write: uploads the .caf asset, keyed off the source clip\'s own filename', async () => {
    const path = join(dir, 'chaozhou.yaml')
    writeFileSync(path, stringify(audioTable({ dio5: [clip()] })))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    const result = await backfillCafOpus(path, audioTable({ dio5: [clip()] }), { write: true, ...tools })

    const expectedUrl = `${AUDIO_CDN_BASE}/clips/dio5-jky.caf`
    expect(result.backfilled).toEqual([{ bucket: 'clips', key: 'dio5', index: 0, cafUrl: expectedUrl }])
    expect(tools.putCalls).toHaveLength(1)
    expect(tools.putCalls[0]?.key).toBe('clips/dio5-jky.caf')
    expect(tools.putCalls[0]?.contentType).toBe('audio/x-caf')

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].cafUrl).toBe(expectedUrl)
    expect(written.clips.dio5[0].cafChecksum).toMatch(/^sha256:[0-9a-f]{64}$/u)
    // The source clip's own fields survive untouched alongside the new ones.
    expect(written.clips.dio5[0].url).toBe(WEBM_URL)
  })

  it('gives two different source clips two different CAF keys', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const table = audioTable({ dio5: [clip()], ziu1: [clip({ url: WEBM_URL_2 })] })
    writeFileSync(path, stringify(table))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))

    await backfillCafOpus(path, table, { write: true, ...tools })

    expect(tools.putCalls.map((p) => p.key)).toEqual(['clips/dio5-jky.caf', 'clips/ziu1-jky.caf'])
  })

  it('skips a clip that already has a cafUrl, without fetching it', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const already = clip({
      cafUrl: `${AUDIO_CDN_BASE}/clips/dio5-jky.caf`,
      cafChecksum: `sha256:${'b'.repeat(64)}`,
    })
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

  it('persists each clip as it completes, so a later failure does not lose earlier progress', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const table = audioTable({ dio5: [clip()], ziu1: [clip({ url: WEBM_URL_2 })] })
    writeFileSync(path, stringify(table))
    const tools = fakeTools(mkdtempSync(join(tmpdir(), 'caf-backfill-tmp-')))
    let calls = 0
    tools.fetchBytes = async () => {
      calls += 1
      if (calls === 2) throw new Error('network blip')
      return Buffer.from('fake webm bytes')
    }

    await expect(backfillCafOpus(path, table, { write: true, ...tools })).rejects.toThrow('network blip')

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].cafUrl).toBeDefined()
    expect(written.clips.ziu1[0].cafUrl).toBeUndefined()
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
