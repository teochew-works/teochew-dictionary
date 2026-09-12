import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FEATURES_VERSION } from '../src/audio/features.js'
import { synthesizeClips, type SynthJobClip } from '../src/audio/synthesize.js'
import { DU2_FEATURES, RENDER_INFO } from './helpers/audio-fixtures.js'

const TARGET = { contourHz: Array(20).fill(140), voicedMs: 450, onsetMs: null, rmsDb: -12.5 }

const INFO = RENDER_INFO

describe('synthesizeClips', () => {
  let dir: string
  let outDir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audio-synth-test-'))
    outDir = join(dir, 'out', 'chaozhou')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('decodes, hands the tool per-syllable targets and output paths, and keys results by syllable', () => {
    const jobs: SynthJobClip[] = [
      { key: 'du2', id: 'sha-du2', webmPath: '/clips/sha-du2.webm', target: TARGET },
      { key: 'dua7', id: 'sha-dua7', webmPath: '/clips/sha-dua7.webm', target: { ...TARGET, onsetMs: 60 } },
    ]
    let toolJob: { clips: { id: string; wav: string; out: string; target: unknown }[] } | undefined

    const result = synthesizeClips(jobs, outDir, {
      tmpDir: dir,
      runFfmpeg: () => {},
      runResynth: (subcommand, jobPath, outPath) => {
        expect(subcommand).toBe('synthesize')
        toolJob = JSON.parse(readFileSync(jobPath, 'utf8'))
        const clips = Object.fromEntries(
          toolJob!.clips.map((c) => [c.id, { out: c.out, info: INFO, features: DU2_FEATURES }]),
        )
        writeFileSync(outPath, JSON.stringify({ version: FEATURES_VERSION, clips, errors: {} }))
      },
    })

    expect(existsSync(outDir)).toBe(true)
    expect(toolJob!.clips.map((c) => [c.id, c.out, c.target])).toEqual([
      ['du2', join(outDir, 'du2.wav'), TARGET],
      ['dua7', join(outDir, 'dua7.wav'), { ...TARGET, onsetMs: 60 }],
    ])
    expect(toolJob!.clips[0]!.wav).toBe(join(dir, 'sha-du2.wav'))
    expect(result.rendered['du2']).toEqual({ key: 'du2', id: 'sha-du2', wavPath: join(outDir, 'du2.wav'), info: INFO, features: DU2_FEATURES })
    expect(result.rendered['dua7']!.id).toBe('sha-dua7')
    expect(result.errors).toEqual({})
    // Batch WAVs are dropped once the tool has run.
    expect(existsSync(join(dir, 'sha-du2.wav'))).toBe(false)
  })

  it('reports a decode failure and a tool failure per syllable, and keeps going', () => {
    const jobs: SynthJobClip[] = [
      { key: 'a1', id: 'a', webmPath: '/clips/a.webm', target: TARGET },
      { key: 'b1', id: 'b', webmPath: '/clips/b.webm', target: TARGET },
      { key: 'c1', id: 'c', webmPath: '/clips/c.webm', target: TARGET },
    ]
    const result = synthesizeClips(jobs, outDir, {
      tmpDir: dir,
      batchSize: 2,
      runFfmpeg: (args) => {
        if (args[args.indexOf('-i') + 1]!.endsWith('b.webm')) throw new Error('corrupt')
      },
      runResynth: (_s, jobPath, outPath) => {
        const job = JSON.parse(readFileSync(jobPath, 'utf8')) as { clips: { id: string; out: string }[] }
        const clips = Object.fromEntries(job.clips.filter((c) => c.id !== 'c1').map((c) => [c.id, { out: c.out, info: INFO, features: DU2_FEATURES }]))
        const errors = job.clips.some((c) => c.id === 'c1') ? { c1: 'UnvoicedClip: no voiced frames inside the active region' } : {}
        writeFileSync(outPath, JSON.stringify({ version: FEATURES_VERSION, clips, errors }))
      },
    })
    expect(Object.keys(result.rendered)).toEqual(['a1'])
    expect(result.errors).toEqual({
      b1: expect.stringContaining('failed to decode /clips/b.webm: corrupt'),
      c1: 'UnvoicedClip: no voiced frames inside the active region',
    })
  })

  it('refuses a tool result of the wrong version', () => {
    expect(() =>
      synthesizeClips([{ key: 'a1', id: 'a', webmPath: '/a.webm', target: TARGET }], outDir, {
        tmpDir: dir,
        runFfmpeg: () => {},
        runResynth: (_s, _j, outPath) => writeFileSync(outPath, JSON.stringify({ version: 1, clips: {}, errors: {} })),
      }),
    ).toThrow(/version 1, expected 2/)
  })
})
