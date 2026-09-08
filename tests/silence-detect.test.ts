import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { detectSilence } from '../src/importers/silence-detect.js'

/** Mirrors the real `du2.webm` corpus clip cited in issue #252: 239ms leading, ~44ms trailing, out of a 720ms clip. */
const DU2_SILENCEDETECT_OUTPUT = `
[silencedetect @ 0x0] silence_start: 0
[silencedetect @ 0x0] silence_end: 0.238542 | silence_duration: 0.238542
[silencedetect @ 0x0] silence_start: 0.6765
[silencedetect @ 0x0] silence_end: 0.78 | silence_duration: 0.1035
`

describe('detectSilence', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'silence-detect-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('detects both leading and trailing silence, clamping a trailing silence_end past the probed duration', () => {
    const result = detectSilence(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfprobe: () => '0.720000',
      runFfmpeg: () => DU2_SILENCEDETECT_OUTPUT,
    })

    expect(result).toEqual({ trimStartMs: 239, trimEndMs: 677 })
  })

  it('detects leading-only silence', () => {
    const result = detectSilence(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfprobe: () => '1.0',
      runFfmpeg: () => `
        silence_start: 0
        silence_end: 0.2 | silence_duration: 0.2
      `,
    })

    expect(result).toEqual({ trimStartMs: 200, trimEndMs: null })
  })

  it('detects trailing-only silence', () => {
    const result = detectSilence(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfprobe: () => '1.0',
      runFfmpeg: () => `
        silence_start: 0.8
        silence_end: 1.0 | silence_duration: 0.2
      `,
    })

    expect(result).toEqual({ trimStartMs: null, trimEndMs: 800 })
  })

  it('finds nothing to trim when silence never touches an edge', () => {
    const result = detectSilence(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfprobe: () => '1.0',
      runFfmpeg: () => `
        silence_start: 0.4
        silence_end: 0.5 | silence_duration: 0.1
      `,
    })

    expect(result).toEqual({ trimStartMs: null, trimEndMs: null })
  })

  it('finds nothing to trim when ffmpeg reports no silence at all', () => {
    const result = detectSilence(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfprobe: () => '1.0',
      runFfmpeg: () => '',
    })

    expect(result).toEqual({ trimStartMs: null, trimEndMs: null })
  })

  it('refuses to trim a clip whose only silence period spans the entire clip', () => {
    const result = detectSilence(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfprobe: () => '1.0',
      runFfmpeg: () => `
        silence_start: 0
        silence_end: 1.0 | silence_duration: 1.0
      `,
    })

    expect(result).toEqual({ trimStartMs: null, trimEndMs: null })
  })

  it('cleans up its temp file even when a step throws', () => {
    let clipPath: string | undefined
    expect(() =>
      detectSilence(Buffer.from('fake webm bytes'), {
        tmpDir,
        runFfprobe: (args) => {
          clipPath = args.at(-1)
          throw new Error('ffprobe failed')
        },
      }),
    ).toThrow('ffprobe failed')

    expect(clipPath).toBeDefined()
    expect(existsSync(clipPath!)).toBe(false)
  })

  it('removes the temp directory it created itself, but leaves a caller-supplied one in place', () => {
    detectSilence(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfprobe: () => '1.0',
      runFfmpeg: () => '',
    })
    expect(existsSync(tmpDir)).toBe(true)

    let created: string | undefined
    detectSilence(Buffer.from('fake webm bytes'), {
      runFfprobe: (args) => {
        created = args.at(-1)!.replace(/[^/]+$/u, '').replace(/\/$/u, '')
        return '1.0'
      },
      runFfmpeg: () => '',
    })
    expect(created).toBeDefined()
    expect(existsSync(created!)).toBe(false)
  })
})
