import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { audioSchema, type Audio } from '@teochew/core'
import {
  RESYNTH_SOURCE,
  encodeWebm,
  mergeResynth,
  readResynthReport,
  resynthSpeakerId,
  type ResynthReport,
  type ResynthReportClip,
} from '../src/importers/resynth-merge.js'
import { AUDIO_CDN_BASE } from '../src/importers/s3-upload.js'
import type { PutObjectParams } from '../src/importers/s3-upload.js'
import { DU2_FEATURES, RENDER_INFO } from './helpers/audio-fixtures.js'

const REC_URL = `${AUDIO_CDN_BASE}/teochew/clips/jky/du2.webm`
const REC_SHA = 'a'.repeat(64)
const OTHER_SHA = 'b'.repeat(64)

function recording(overrides: Partial<Audio['clips'][string][number]> = {}) {
  return { url: REC_URL, confidence: 'high' as const, sources: ['fixture'], speaker: 'jky', checksum: `sha256:${REC_SHA}`, ...overrides }
}

function renderOf(id: string, pass = true, wavPath = '/renders/du2.wav'): ResynthReportClip {
  return {
    id,
    wavPath,
    info: RENDER_INFO,
    features: DU2_FEATURES,
    check: { z: {}, maxZ: pass ? 0.3 : 2.1, flags: pass ? [] : ['rmsDb +2.1σ off target'], pass },
  }
}

function report(clips: Record<string, ResynthReportClip>): ResynthReport {
  return { version: 1, generated: '2026-09-11T00:00:00Z', variety: 'chaozhou', clips, errors: {} }
}

/** Fake external-tool hooks: no real ffmpeg/afconvert/AWS — every step just proves the pipeline was invoked. */
function fakeTools(tmpDir: string) {
  const putCalls: PutObjectParams[] = []
  return {
    tmpDir,
    readWav: () => Buffer.from('fake wav'),
    runFfmpeg: (args: string[]) => {
      // Both encodeWebm (wav → webm) and encodeCaf (webm → wav) go through here; write whichever output was asked for.
      const out = args[args.length - 1]!
      writeFileSync(out, out.endsWith('.webm') ? 'fake webm' : 'fake wav')
    },
    runFfprobe: () => '128000',
    runAfconvert: (args: string[]) => writeFileSync(args[args.length - 1]!, 'fake caf'),
    headObject: async () => undefined,
    putObject: async (params: PutObjectParams) => {
      putCalls.push(params)
    },
    renderDate: '2026-09-11',
    putCalls,
  }
}

describe('resynthSpeakerId', () => {
  it("suffixes the recording's speaker, or a placeholder when it has none", () => {
    expect(resynthSpeakerId(recording())).toBe('jky-n')
    expect(resynthSpeakerId(recording({ speaker: undefined }))).toBe('recording-n')
  })
})

describe('readResynthReport', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'resynth-report-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads <synthDir>/<variety>/report.json, or null when absent', () => {
    expect(readResynthReport('chaozhou', dir)).toBeNull()
    mkdirSync(join(dir, 'chaozhou'))
    writeFileSync(join(dir, 'chaozhou', 'report.json'), JSON.stringify(report({})))
    expect(readResynthReport('chaozhou', dir)).toMatchObject({ variety: 'chaozhou' })
  })
})

describe('encodeWebm', () => {
  it('runs ffmpeg wav → libopus webm at the tier bitrate and returns the bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'encode-webm-'))
    let seen: string[] = []
    const bytes = encodeWebm(Buffer.from('wav'), {
      tmpDir: dir,
      runFfmpeg: (args) => {
        seen = args
        writeFileSync(args[args.length - 1]!, 'webm out')
      },
    })
    expect(bytes.toString()).toBe('webm out')
    expect(seen).toEqual(expect.arrayContaining(['-c:a', 'libopus', '-b:a', '128k']))
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('mergeResynth', () => {
  let dir: string
  let manifest: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'resynth-merge-'))
    manifest = join(dir, 'chaozhou.yaml')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function writeManifest(audio: Audio): void {
    writeFileSync(manifest, `# hand comment that must survive\n${stringify(audio)}`)
  }

  it('dry run encodes every passing render but uploads and writes nothing', async () => {
    const audio: Audio = { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips: { du2: [recording()] } }
    writeManifest(audio)
    const tools = fakeTools(dir)
    const result = await mergeResynth(manifest, audio, report({ du2: renderOf(REC_SHA), dua7: renderOf(OTHER_SHA, false) }), tools)

    expect(result).toMatchObject({ scanned: 2, skippedFailedCheck: 1, skippedAlreadyMerged: 0, errors: [] })
    expect(result.merged).toEqual([{ key: 'du2', speaker: 'jky-n', url: '(dry run, not uploaded)', cafUrl: '(dry run, not uploaded)' }])
    expect(tools.putCalls).toEqual([])
    expect(readFileSync(manifest, 'utf8')).toContain('# hand comment')
    expect(parseYaml(readFileSync(manifest, 'utf8')).clips.du2).toHaveLength(1)
  })

  it('--write uploads webm and caf to S3 under the <speaker>/<key> path and appends a provenance-linked clip', async () => {
    const audio: Audio = { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips: { du2: [recording()] } }
    writeManifest(audio)
    const tools = fakeTools(dir)
    const result = await mergeResynth(manifest, audio, report({ du2: renderOf(REC_SHA) }), { ...tools, write: true })

    const expectedWebmUrl = `${AUDIO_CDN_BASE}/teochew/clips/jky-n/du2.webm`
    const expectedCafUrl = `${AUDIO_CDN_BASE}/teochew/clips/jky-n/du2.caf`
    expect(result.merged).toEqual([{ key: 'du2', speaker: 'jky-n', url: expectedWebmUrl, cafUrl: expectedCafUrl }])
    expect(tools.putCalls.map((p) => [p.key, p.contentType])).toEqual([
      ['teochew/clips/jky-n/du2.webm', 'audio/webm'],
      ['teochew/clips/jky-n/du2.caf', 'audio/x-caf'],
    ])

    const text = readFileSync(manifest, 'utf8')
    expect(text).toContain('# hand comment')
    const written = audioSchema.parse(parseYaml(text))
    expect(written.clips['du2']).toHaveLength(2)
    expect(written.clips['du2']![0]).toEqual(recording())
    expect(written.clips['du2']![1]).toMatchObject({
      speaker: 'jky-n',
      confidence: 'medium',
      sources: [RESYNTH_SOURCE],
      recorded: '2026-09-11',
      synthesis: 'world-retune',
      derivedFrom: `sha256:${REC_SHA}`,
      trimStartMs: 50,
      trimEndMs: 500,
    })
    expect(written.clips['du2']![1]!.checksum).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(written.clips['du2']![1]!.cafChecksum).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('skips a syllable already rendered by this speaker id unless --force, which overwrites in place', async () => {
    const existing = recording({
      url: `${AUDIO_CDN_BASE}/teochew/clips/jky-n/du2.webm`,
      checksum: `sha256:${'c'.repeat(64)}`,
      confidence: 'medium',
      speaker: 'jky-n',
      synthesis: 'world-retune',
      derivedFrom: `sha256:${REC_SHA}`,
    })
    const audio: Audio = { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips: { du2: [recording(), existing] } }
    writeManifest(audio)
    const tools = fakeTools(dir)

    const skipped = await mergeResynth(manifest, audio, report({ du2: renderOf(REC_SHA) }), { ...tools, write: true })
    expect(skipped).toMatchObject({ skippedAlreadyMerged: 1, merged: [] })
    expect(tools.putCalls).toEqual([])

    const forced = await mergeResynth(manifest, audio, report({ du2: renderOf(REC_SHA) }), { ...tools, write: true, force: true })
    expect(forced.merged).toHaveLength(1)
    expect(tools.putCalls.map((p) => p.key)).toEqual(['teochew/clips/jky-n/du2.webm', 'teochew/clips/jky-n/du2.caf'])
    const written = audioSchema.parse(parseYaml(readFileSync(manifest, 'utf8')))
    expect(written.clips['du2']).toHaveLength(2)
    expect(written.clips['du2']![1]!.recorded).toBe('2026-09-11')
  })

  it('reports a render whose source is no longer a recording at that key, and keeps going', async () => {
    const audio: Audio = { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips: { du2: [recording()], dua7: [recording({ checksum: `sha256:${OTHER_SHA}` })] } }
    writeManifest(audio)
    const stale = report({ du2: renderOf('d'.repeat(64)), dua7: renderOf(OTHER_SHA) })
    const result = await mergeResynth(manifest, audio, stale, { ...fakeTools(dir), write: true })
    expect(result.errors).toEqual([{ key: 'du2', message: expect.stringContaining('not a recording at') }])
    expect(result.merged.map((m) => m.key)).toEqual(['dua7'])
  })

  it('honours --only and --skip-caf', async () => {
    const audio: Audio = { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips: { du2: [recording()], dua7: [recording({ checksum: `sha256:${OTHER_SHA}` })] } }
    writeManifest(audio)
    const tools = fakeTools(dir)
    const result = await mergeResynth(manifest, audio, report({ du2: renderOf(REC_SHA), dua7: renderOf(OTHER_SHA) }), {
      ...tools,
      write: true,
      only: ['dua7'],
      skipCaf: true,
    })
    expect(result.scanned).toBe(1)
    expect(result.merged).toEqual([{ key: 'dua7', speaker: 'jky-n', url: expect.stringContaining('/dua7.webm') }])
    expect(tools.putCalls).toHaveLength(1)
    const written = audioSchema.parse(parseYaml(readFileSync(manifest, 'utf8')))
    expect(written.clips['dua7']![1]!.cafUrl).toBeUndefined()
  })

  it('refuses to write to a manifest that does not exist', async () => {
    const audio: Audio = { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips: { du2: [recording()] } }
    await expect(mergeResynth(join(dir, 'missing.yaml'), audio, report({ du2: renderOf(REC_SHA) }), { ...fakeTools(dir), write: true })).rejects.toThrow(/no such file/)
  })
})
