import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  VARIETY,
  toCanonicalWav,
  generatedSide,
  listItems,
  listSets,
  readReviewFile,
  resolveAudio,
  saveVerdict,
  summarise,
} from './tts-review-handlers.js'

/** A tts dir with `<variety>/wavs` originals and some generated sets. */
function scaffold(dir: string, originals: string[], sets: Record<string, string[]>): void {
  const wavs = join(dir, VARIETY, 'wavs')
  mkdirSync(wavs, { recursive: true })
  for (const key of originals) writeFileSync(join(wavs, `${key}.wav`), `original:${key}`)
  for (const [setId, keys] of Object.entries(sets)) {
    const setDir = join(dir, setId)
    mkdirSync(setDir, { recursive: true })
    for (const key of keys) writeFileSync(join(setDir, `${key}.wav`), `generated:${setId}:${key}`)
  }
}

describe('tts review handlers', () => {
  let dir: string
  let deps: { ttsDir: string }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tts-review-test-'))
    deps = { ttsDir: dir }
    scaffold(dir, ['du2', 'dua7', 'iu5', 'a1'], {
      'sweep/pengim-1.3': ['du2', 'dua7', 'iu5'],
      'eval/ipa': ['du2', 'zzz9'], // zzz9 has no original — not comparable
    })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('listSets', () => {
    it('counts only syllables that have both a generated clip and an original', () => {
      expect(listSets(deps)).toEqual([
        { id: 'eval/ipa', count: 1 },
        { id: 'sweep/pengim-1.3', count: 3 },
      ])
    })

    it('steps over loose files beside the set directories', () => {
      // `.cache/audio-tts/eval/` really does hold a holdout.txt next to the sets.
      writeFileSync(join(dir, 'eval', 'holdout.txt'), 'du2\ndua7\n')
      writeFileSync(join(dir, 'eval.sh'), '#!/bin/sh\n')
      expect(() => listSets(deps)).not.toThrow()
      expect(listSets(deps).map((s) => s.id)).toEqual(['eval/ipa', 'sweep/pengim-1.3'])
    })

    it('ignores directories with no generated audio', () => {
      mkdirSync(join(dir, 'runs', 'empty'), { recursive: true })
      expect(listSets(deps).map((s) => s.id)).not.toContain('runs/empty')
    })

    it('finds a set one level deeper, as `tts synth --out` under a run leaves it', () => {
      scaffold(dir, [], { 'runs/pengim/holdout': ['du2', 'iu5'] })
      expect(listSets(deps)).toContainEqual({ id: 'runs/pengim/holdout', count: 2 })
    })
  })

  describe('blinding', () => {
    it('is stable for a syllable, so a reload cannot reveal the answer', () => {
      const first = generatedSide('sweep/pengim-1.3', 'du2')
      expect(generatedSide('sweep/pengim-1.3', 'du2')).toBe(first)
    })

    it('depends on the syllable, so one answer does not give away the next', () => {
      const sides = ['du2', 'dua7', 'iu5', 'a1', 'ng5', 'm6', 'ziah8', 'cên1'].map((k) => generatedSide('s', k))
      expect(new Set(sides).size).toBe(2) // both sides occur across a handful of keys
    })

    it('depends on the set too, so re-rendering into a new set reshuffles the pairing', () => {
      const sides = Array.from({ length: 12 }, (_, i) => generatedSide(`set-${i}`, 'du2'))
      expect(new Set(sides).size).toBe(2)
    })

    it('splits roughly evenly, so neither side is the safe guess', () => {
      const keys = Array.from({ length: 400 }, (_, i) => `syl${i}`)
      const onA = keys.filter((k) => generatedSide('sweep/pengim-1.3', k) === 'a').length
      expect(onA).toBeGreaterThan(150)
      expect(onA).toBeLessThan(250)
    })

    it('serves the generated clip on its side and the original on the other', () => {
      const side = generatedSide('sweep/pengim-1.3', 'du2')
      const other = side === 'a' ? 'b' : 'a'
      expect(readFileSync(resolveAudio('sweep/pengim-1.3', 'du2', side, deps)!, 'utf8')).toBe('generated:sweep/pengim-1.3:du2')
      expect(readFileSync(resolveAudio('sweep/pengim-1.3', 'du2', other, deps)!, 'utf8')).toBe('original:du2')
    })

    it('the listed item exposes no hint of which side is which', () => {
      const result = listItems('sweep/pengim-1.3', deps)
      expect(result.ok).toBe(true)
      const item = result.ok ? result.items.find((i) => i.key === 'du2')! : null
      expect(JSON.stringify(item)).not.toMatch(/generated|original|wavs|sweep\/pengim-1\.3\//u)
      expect(item!.aUrl).toBe('/api/tts-review/audio/sweep%2Fpengim-1.3/du2/a')
    })
  })

  describe('resolveAudio', () => {
    it('refuses an unknown set and a key that escapes the directory', () => {
      expect(resolveAudio('sweep/nope', 'du2', 'a', deps)).toBeNull()
      expect(resolveAudio('sweep/pengim-1.3', '../../etc/passwd', 'a', deps)).toBeNull()
      expect(resolveAudio('sweep/pengim-1.3', '..', 'a', deps)).toBeNull()
    })

    it('refuses BOTH sides when only one of the pair exists', () => {
      // zzz9 is generated but never recorded. Answering on one side and 404ing
      // the other would say which side is the generated one.
      expect(resolveAudio('eval/ipa', 'zzz9', 'a', deps)).toBeNull()
      expect(resolveAudio('eval/ipa', 'zzz9', 'b', deps)).toBeNull()
    })

    it('refuses both sides for a syllable recorded but not generated', () => {
      // a1 has an original but is not in this set.
      expect(resolveAudio('sweep/pengim-1.3', 'a1', 'a', deps)).toBeNull()
      expect(resolveAudio('sweep/pengim-1.3', 'a1', 'b', deps)).toBeNull()
    })
  })

  describe('listItems', () => {
    it('lists only comparable syllables, sorted, with no verdict yet', () => {
      const result = listItems('sweep/pengim-1.3', deps)
      expect(result.ok && result.items.map((i) => i.key)).toEqual(['du2', 'dua7', 'iu5'])
      expect(result.ok && result.items.every((i) => i.verdict === null)).toBe(true)
    })

    it('drops a generated syllable with no recording to compare against', () => {
      const result = listItems('eval/ipa', deps)
      expect(result.ok && result.items.map((i) => i.key)).toEqual(['du2'])
    })

    it('reports an unknown set rather than throwing', () => {
      expect(listItems('sweep/nope', deps)).toEqual({ ok: false, error: 'unknown set: sweep/nope' })
    })
  })

  describe('saveVerdict', () => {
    it('resolves the preference against the hidden side and persists it', () => {
      const side = generatedSide('sweep/pengim-1.3', 'du2')
      const result = saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: side, quality: 'acceptable' }, deps)
      expect(result.ok).toBe(true)
      expect(result.ok && result.verdict).toMatchObject({ preferred: side, preferredGenerated: true, generatedSide: side, quality: 'acceptable' })

      const stored = readReviewFile(deps)
      expect(stored.verdicts['sweep/pengim-1.3']!['du2']!.preferredGenerated).toBe(true)
    })

    it('records preferring the recording as preferredGenerated false', () => {
      const other = generatedSide('sweep/pengim-1.3', 'iu5') === 'a' ? 'b' : 'a'
      const result = saveVerdict({ setId: 'sweep/pengim-1.3', key: 'iu5', preferred: other, quality: 'worse' }, deps)
      expect(result.ok && result.verdict.preferredGenerated).toBe(false)
    })

    it('records no preference as null rather than guessing', () => {
      const result = saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: 'neither', quality: 'indistinguishable' }, deps)
      expect(result.ok && result.verdict.preferredGenerated).toBeNull()
    })

    it('overwrites an earlier verdict for the same syllable', () => {
      saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: 'neither', quality: 'acceptable' }, deps)
      saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: 'neither', quality: 'unusable', note: 'wrong tone' }, deps)
      const stored = readReviewFile(deps).verdicts['sweep/pengim-1.3']!['du2']!
      expect(stored.quality).toBe('unusable')
      expect(stored.note).toBe('wrong tone')
      expect(Object.keys(readReviewFile(deps).verdicts['sweep/pengim-1.3']!)).toEqual(['du2'])
    })

    it('keeps verdicts for different sets apart', () => {
      saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: 'a', quality: 'acceptable' }, deps)
      saveVerdict({ setId: 'eval/ipa', key: 'du2', preferred: 'b', quality: 'worse' }, deps)
      const stored = readReviewFile(deps).verdicts
      expect(Object.keys(stored).sort()).toEqual(['eval/ipa', 'sweep/pengim-1.3'])
      expect(stored['eval/ipa']!['du2']!.quality).toBe('worse')
    })

    it('rejects bad input rather than storing it', () => {
      expect(saveVerdict({ key: 'du2', preferred: 'a', quality: 'acceptable' }, deps)).toEqual({ ok: false, error: 'setId and key are required' })
      expect(saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: 'x', quality: 'acceptable' }, deps).ok).toBe(false)
      expect(saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: 'a', quality: 'great' }, deps).ok).toBe(false)
      expect(saveVerdict({ setId: 'sweep/pengim-1.3', key: 'nope', preferred: 'a', quality: 'acceptable' }, deps)).toEqual({
        ok: false,
        error: 'nothing to review at sweep/pengim-1.3/nope',
      })
      expect(readReviewFile(deps).verdicts).toEqual({})
    })
  })

  describe('summarise', () => {
    it('counts preferences and qualities for one set', () => {
      const side = (k: string) => generatedSide('sweep/pengim-1.3', k)
      const other = (k: string) => (side(k) === 'a' ? 'b' : 'a')
      saveVerdict({ setId: 'sweep/pengim-1.3', key: 'du2', preferred: side('du2'), quality: 'indistinguishable' }, deps)
      saveVerdict({ setId: 'sweep/pengim-1.3', key: 'dua7', preferred: other('dua7'), quality: 'worse' }, deps)
      saveVerdict({ setId: 'sweep/pengim-1.3', key: 'iu5', preferred: 'neither', quality: 'acceptable' }, deps)

      expect(summarise('sweep/pengim-1.3', deps)).toEqual({
        n: 3,
        preferredGenerated: 1,
        preferredOriginal: 1,
        noPreference: 1,
        quality: { indistinguishable: 1, acceptable: 1, worse: 1, unusable: 0 },
      })
    })

    it('is empty for a set nobody has judged', () => {
      expect(summarise('eval/ipa', deps)).toMatchObject({ n: 0, preferredGenerated: 0, preferredOriginal: 0 })
    })
  })

  describe('toCanonicalWav', () => {
    /** A minimal WAV of `samples`, as float32 or int16. */
    function wav(samples: number[], float: boolean, extraChunk = false): Buffer {
      const bytesPerSample = float ? 4 : 2
      const body = Buffer.alloc(samples.length * bytesPerSample)
      samples.forEach((v, i) => (float ? body.writeFloatLE(v, i * 4) : body.writeInt16LE(v, i * 2)))
      const extra = extraChunk ? Buffer.concat([Buffer.from('LIST'), int32(4), Buffer.from('INFO')]) : Buffer.alloc(0)
      const fmt = Buffer.alloc(24)
      fmt.write('fmt ', 0, 'ascii')
      fmt.writeUInt32LE(16, 4)
      fmt.writeUInt16LE(float ? 3 : 1, 8)
      fmt.writeUInt16LE(1, 10)
      fmt.writeUInt32LE(22050, 12)
      fmt.writeUInt32LE(22050 * bytesPerSample, 16)
      fmt.writeUInt16LE(bytesPerSample, 20)
      fmt.writeUInt16LE(float ? 32 : 16, 22)
      const data = Buffer.concat([Buffer.from('data'), int32(body.length), body])
      const rest = Buffer.concat([Buffer.from('WAVE'), fmt, extra, data])
      return Buffer.concat([Buffer.from('RIFF'), int32(rest.length), rest])
    }
    function int32(v: number): Buffer {
      const b = Buffer.alloc(4)
      b.writeUInt32LE(v, 0)
      return b
    }

    it('converts float32 and 16-bit input to the same size, so size reveals nothing', () => {
      const asFloat = toCanonicalWav(wav([0, 0.5, -0.5, 1], true))
      const asInt = toCanonicalWav(wav([0, 16384, -16384, 32767], false))
      expect(asFloat.length).toBe(asInt.length)
      expect(asFloat.length).toBe(44 + 4 * 2)
    })

    it('preserves the samples, rate and channel count', () => {
      const out = toCanonicalWav(wav([0, 0.5, -0.5, 1], true))
      expect(out.toString('ascii', 0, 4)).toBe('RIFF')
      expect(out.readUInt16LE(20)).toBe(1) // PCM
      expect(out.readUInt16LE(22)).toBe(1) // mono
      expect(out.readUInt32LE(24)).toBe(22050)
      expect(out.readUInt16LE(34)).toBe(16)
      // Scaled by 32767 so full scale is symmetric; -0.5 lands on -16383.5 and
      // rounds up, a half-LSB either way.
      expect([out.readInt16LE(44), out.readInt16LE(46), out.readInt16LE(48), out.readInt16LE(50)]).toEqual([0, 16384, -16383, 32767])
    })

    it('clamps samples beyond full scale rather than wrapping', () => {
      const out = toCanonicalWav(wav([2, -2], true))
      expect([out.readInt16LE(44), out.readInt16LE(46)]).toEqual([32767, -32767])
    })

    it('walks past a LIST chunk, as ffmpeg writes one', () => {
      const out = toCanonicalWav(wav([0.5], true, true))
      expect(out.readInt16LE(44)).toBe(16384)
    })

    it('rejects input that is not a WAV this repo produced', () => {
      expect(() => toCanonicalWav(Buffer.from('not a wav at all'))).toThrow(/not a WAV/u)
    })
  })

  it('survives a corrupt or foreign review.json rather than throwing', () => {
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ version: 99, nonsense: true }))
    expect(readReviewFile(deps)).toEqual({ version: 1, verdicts: {} })
  })
})
