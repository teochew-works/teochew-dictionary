import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { encodeCaf, probeBitrateBps } from '../src/importers/caf-encode.js'

describe('probeBitrateBps', () => {
  it("reads the audio stream's own reported bitrate", () => {
    const calls: string[][] = []
    const runFfprobe = (args: string[]) => {
      calls.push(args)
      return '140000\n'
    }
    expect(probeBitrateBps('/tmp/clip.webm', runFfprobe)).toBe(140_000)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/tmp/clip.webm')
    expect(calls[0]).toContain('a:0')
  })

  it('falls back to the container-level bitrate when the stream reports none', () => {
    let call = 0
    const runFfprobe = () => {
      call += 1
      return call === 1 ? 'N/A\n' : '96000\n'
    }
    expect(probeBitrateBps('/tmp/clip.webm', runFfprobe)).toBe(96_000)
  })

  it('falls back to a conservative default when neither reports a bitrate', () => {
    expect(probeBitrateBps('/tmp/clip.webm', () => 'N/A\n')).toBe(96_000)
  })
})

describe('encodeCaf', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'caf-encode-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('shells out to ffmpeg then afconvert with the probed bitrate, returning the resulting bytes', () => {
    const ffmpegCalls: string[][] = []
    const afconvertCalls: string[][] = []
    const cafBytes = Buffer.from('fake caf bytes')

    const result = encodeCaf(Buffer.from('fake webm bytes'), {
      tmpDir,
      runFfmpeg: (args) => {
        ffmpegCalls.push(args)
        writeFileSync(join(tmpDir, 'clip.wav'), 'fake wav bytes')
      },
      runFfprobe: () => '140000',
      runAfconvert: (args) => {
        afconvertCalls.push(args)
        writeFileSync(join(tmpDir, 'clip.caf'), cafBytes)
      },
    })

    expect(ffmpegCalls).toEqual([['-y', '-i', join(tmpDir, 'clip.webm'), join(tmpDir, 'clip.wav')]])
    expect(afconvertCalls).toEqual([
      ['-f', 'caff', '-d', 'opus', '-b', '140000', join(tmpDir, 'clip.wav'), join(tmpDir, 'clip.caf')],
    ])
    expect(result).toEqual(cafBytes)
  })

  it('cleans up its temp files even when a step throws', () => {
    expect(() =>
      encodeCaf(Buffer.from('fake webm bytes'), {
        tmpDir,
        runFfmpeg: () => {
          throw new Error('ffmpeg failed')
        },
      }),
    ).toThrow('ffmpeg failed')
    expect(existsSync(join(tmpDir, 'clip.webm'))).toBe(false)
  })
})
