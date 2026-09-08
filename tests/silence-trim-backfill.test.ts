import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GITHUB_REPO, type Audio } from '@teochew/core'
import { backfillSilenceTrim } from '../src/importers/silence-trim-backfill.js'

const WEBM_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.webm`
const WEBM_URL_2 = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/ziu1.webm`

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

/** Fake external-tool hooks: no real ffmpeg/ffprobe — every step just proves the pipeline was invoked. */
function fakeTools() {
  return {
    fetchBytes: async () => Buffer.from('fake webm bytes'),
    runFfprobe: () => '0.720000',
    runFfmpeg: () =>
      'silence_start: 0\nsilence_end: 0.239 | silence_duration: 0.239\n' +
      'silence_start: 0.677\nsilence_end: 0.78 | silence_duration: 0.103\n',
  }
}

describe('backfillSilenceTrim', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'silence-trim-backfill-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('dry run: fetches and analyzes but writes nothing', async () => {
    const path = join(dir, 'chaozhou.yaml')
    writeFileSync(path, stringify(audioTable({ dio5: [clip()] })))
    const tools = fakeTools()

    const result = await backfillSilenceTrim(path, audioTable({ dio5: [clip()] }), { write: false, ...tools })

    expect(result.scanned).toBe(1)
    expect(result.backfilled).toEqual([{ bucket: 'clips', key: 'dio5', index: 0, trimStartMs: 239, trimEndMs: 677 }])
    expect(parseYaml(readFileSync(path, 'utf8')).clips.dio5[0].trimStartMs).toBeUndefined()
  })

  it('--write: fills both fields onto a clip with neither set', async () => {
    const path = join(dir, 'chaozhou.yaml')
    writeFileSync(path, stringify(audioTable({ dio5: [clip()] })))
    const tools = fakeTools()

    const result = await backfillSilenceTrim(path, audioTable({ dio5: [clip()] }), { write: true, ...tools })

    expect(result.backfilled).toEqual([{ bucket: 'clips', key: 'dio5', index: 0, trimStartMs: 239, trimEndMs: 677 }])
    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].trimStartMs).toBe(239)
    expect(written.clips.dio5[0].trimEndMs).toBe(677)
    // The source clip's own fields survive untouched alongside the new ones.
    expect(written.clips.dio5[0].url).toBe(WEBM_URL)
  })

  it('skips a clip that already has both fields set, without fetching it', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const already = clip({ trimStartMs: 100, trimEndMs: 600 })
    writeFileSync(path, stringify(audioTable({ dio5: [already] })))
    const tools = fakeTools()
    let fetched = false
    tools.fetchBytes = async () => {
      fetched = true
      return Buffer.from('should not be called')
    }

    const result = await backfillSilenceTrim(path, audioTable({ dio5: [already] }), { write: true, ...tools })

    expect(result.skippedHasTrim).toBe(1)
    expect(result.backfilled).toEqual([])
    expect(fetched).toBe(false)
  })

  it('fills only the absent field, leaving a hand-set one untouched', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const partial = clip({ trimStartMs: 42 })
    writeFileSync(path, stringify(audioTable({ dio5: [partial] })))
    const tools = fakeTools()

    await backfillSilenceTrim(path, audioTable({ dio5: [partial] }), { write: true, ...tools })

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].trimStartMs).toBe(42)
    expect(written.clips.dio5[0].trimEndMs).toBe(677)
  })

  it('persists each clip as it completes, so a later failure does not lose earlier progress', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const table = audioTable({ dio5: [clip()], ziu1: [clip({ url: WEBM_URL_2 })] })
    writeFileSync(path, stringify(table))
    const tools = fakeTools()
    let calls = 0
    tools.fetchBytes = async () => {
      calls += 1
      if (calls === 2) throw new Error('network blip')
      return Buffer.from('fake webm bytes')
    }

    await expect(backfillSilenceTrim(path, table, { write: true, ...tools })).rejects.toThrow('network blip')

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].trimStartMs).toBeDefined()
    expect(written.clips.ziu1[0].trimStartMs).toBeUndefined()
  })

  it('preserves a hand-written comment when writing the backfilled fields', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const handComment = '# hand note: dio5 is a Chaoyang-accented recording, verify before reuse'
    writeFileSync(path, `${handComment}\n${stringify(audioTable({ dio5: [clip()] }))}`)
    const tools = fakeTools()

    await backfillSilenceTrim(path, audioTable({ dio5: [clip()] }), { write: true, ...tools })

    expect(readFileSync(path, 'utf8')).toContain(handComment)
  })

  it('throws rather than silently no-op-ing when asked to write to a nonexistent file', async () => {
    const path = join(dir, 'missing.yaml')

    await expect(backfillSilenceTrim(path, audioTable({ dio5: [clip()] }), { write: true, ...fakeTools() })).rejects.toThrow(
      /no such file/,
    )
  })
})
