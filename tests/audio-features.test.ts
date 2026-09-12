import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  FEATURES_VERSION,
  emptyFeaturesCache,
  extractFeatures,
  loadFeaturesCache,
  saveFeaturesCache,
} from '../src/audio/features.js'
import { DU2_FEATURES } from './helpers/audio-fixtures.js'

describe('features cache', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audio-features-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips, and discards a cache written by another extractor version', () => {
    const path = join(dir, 'features.json')
    expect(loadFeaturesCache(path)).toBeNull()

    const cache = emptyFeaturesCache()
    cache.clips['abc'] = DU2_FEATURES
    saveFeaturesCache(cache, path)
    expect(loadFeaturesCache(path)).toEqual(cache)

    writeFileSync(path, JSON.stringify({ version: FEATURES_VERSION - 1, clips: { abc: {} } }))
    expect(loadFeaturesCache(path)).toBeNull()
  })

  it('decodes each clip, batches them through the tool, and merges results and errors', () => {
    const decoded: string[] = []
    const jobs: { clips: { id: string; wav: string }[] }[] = []

    const result = extractFeatures(
      [
        { id: 'a', webmPath: '/clips/a.webm' },
        { id: 'b', webmPath: '/clips/b.webm' },
        { id: 'c', webmPath: '/clips/c.webm' },
      ],
      {
        tmpDir: dir,
        batchSize: 2,
        runFfmpeg: (args) => {
          const input = args[args.indexOf('-i') + 1]!
          if (input.endsWith('b.webm')) throw new Error('corrupt')
          decoded.push(input)
        },
        runResynth: (subcommand, jobPath, outPath) => {
          expect(subcommand).toBe('features')
          const job = JSON.parse(readFileSync(jobPath, 'utf8'))
          jobs.push(job)
          expect(job.version).toBe(FEATURES_VERSION)
          const clips = Object.fromEntries(job.clips.map((c: { id: string }) => [c.id, DU2_FEATURES]))
          const errors = job.clips.some((c: { id: string }) => c.id === 'c') ? { c: 'ValueError: nope' } : {}
          if (errors.c) delete clips.c
          writeFileSync(outPath, JSON.stringify({ version: FEATURES_VERSION, clips, errors }))
        },
      },
    )

    expect(decoded).toEqual(['/clips/a.webm', '/clips/c.webm'])
    // b never reaches the tool; a and c are split across two batches of 2.
    expect(jobs.map((j) => j.clips.map((c) => c.id))).toEqual([['a'], ['c']])
    expect(jobs[0]!.clips[0]!.wav).toBe(join(dir, 'a.wav'))
    expect(existsSync(join(dir, 'a.wav'))).toBe(false)
    expect(result.clips).toEqual({ a: DU2_FEATURES })
    expect(result.errors).toEqual({ b: expect.stringContaining('failed to decode /clips/b.webm: corrupt'), c: 'ValueError: nope' })
  })

  it('refuses a tool result of the wrong version', () => {
    expect(() =>
      extractFeatures([{ id: 'a', webmPath: '/a.webm' }], {
        tmpDir: dir,
        runFfmpeg: () => {},
        runResynth: (_s, _j, outPath) => writeFileSync(outPath, JSON.stringify({ version: 99, clips: {}, errors: {} })),
      }),
    ).toThrow(/version 99, expected 2/)
  })

  it('cleans up a tmp dir it created itself, and leaves a caller-supplied one alone', () => {
    let created: string | undefined
    extractFeatures([{ id: 'a', webmPath: '/a.webm' }], {
      runFfmpeg: () => {},
      runResynth: (_s, jobPath, outPath) => {
        created = join(jobPath, '..')
        writeFileSync(outPath, JSON.stringify({ version: FEATURES_VERSION, clips: {}, errors: {} }))
      },
    })
    expect(existsSync(created!)).toBe(false)
    expect(existsSync(dir)).toBe(true)
  })
})
