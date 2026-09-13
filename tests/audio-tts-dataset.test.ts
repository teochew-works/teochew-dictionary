import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ClipFeatures } from '../src/audio/features.js'
import {
  BOS,
  EOS,
  PAD,
  buildSymbolMap,
  encodeIds,
  exportWav,
  fnv1a,
  formatCsv,
  holdoutKeys,
  ipaTokens,
  pengimTokens,
  selectTrainingClips,
  tokenise,
  writeDataset,
  type DatasetClip,
} from '../src/audio/tts-dataset.js'
import { toIpa } from '../src/phonology/ipa.js'
import { parseSyllable } from '../src/phonology/syllable.js'

function features(overrides: Partial<ClipFeatures> & { f0Hz?: number | null } = {}): ClipFeatures {
  const { f0Hz = 130, ...rest } = overrides
  return {
    totalMs: 1000,
    sampleRate: 48000,
    trim: { startMs: 200, endMs: 800 },
    activeMs: 600,
    rmsDb: -13,
    peakDb: -6,
    onsetMs: 60,
    voicedMs: 500,
    voicedRatio: 0.9,
    f0:
      f0Hz === null
        ? { medianHz: null, startHz: null, endHz: null, contour: null }
        : { medianHz: f0Hz, startHz: f0Hz, endHz: f0Hz, contour: Array(20).fill(f0Hz) },
    ...rest,
  }
}

function clip(key: string, id: string, overrides: Parameters<typeof features>[0] = {}): DatasetClip {
  return { key, id, webmPath: `/clips/${id}.webm`, syllable: parseSyllable(key), features: features(overrides) }
}

/** A tone-1 group jittered symmetrically so the medians stay put and σ > 0. */
function corpus(): DatasetClip[] {
  const rimes = ['a', 'i', 'u', 'e', 'o', 'ai', 'ao', 'ia', 'iu', 'ua']
  const jitter = [0, 1, -1, 2, -2]
  return rimes.map((rime, i) => {
    const j = jitter[i % jitter.length]!
    return clip(`s${rime}1`, `id-${rime}`, { f0Hz: 130 + j, voicedMs: 500 + 4 * j, rmsDb: -13 + j, onsetMs: 60 + j })
  })
}

describe('token schemes', () => {
  it('pengim: one token per NFC codepoint, tone digit included', () => {
    expect(pengimTokens('cên1')).toEqual(['c', 'ê', 'n', '1'])
    expect(pengimTokens('bhuêh8')).toEqual(['b', 'h', 'u', 'ê', 'h', '8'])
    // A decomposed input normalises to the same tokens as a precomposed one.
    expect(pengimTokens('cên1')).toEqual(['c', 'ê', 'n', '1'])
  })

  it('ipa: grapheme clusters with the tone letters replaced by one tone token', () => {
    expect(ipaTokens('tsʰẽ³³', 1)).toEqual(['t', 's', 'ʰ', 'ẽ', 'T1'])
    expect(ipaTokens('tu⁵³', 2)).toEqual(['t', 'u', 'T2'])
    // Combining marks travel with their base: a syllabic nasal or an unreleased stop is one token.
    expect(ipaTokens('pŋ̩¹¹', 7)).toEqual(['p', 'ŋ̩', 'T7'])
    expect(ipaTokens('uk̚²', 4)).toEqual(['u', 'k̚', 'T4'])
  })

  it('tokenise routes by scheme and uses the derived IPA', () => {
    const s = parseSyllable('ziah8')
    expect(tokenise('pengim', s, toIpa('ziah8').ipa)).toEqual(['z', 'i', 'a', 'h', '8'])
    expect(tokenise('ipa', s, toIpa('ziah8').ipa)).toEqual(['t', 's', 'i', 'a', 'ʔ', 'T8'])
  })
})

describe('symbol map and ids', () => {
  it('reserves 0–2 for pad/bos/eos and numbers the rest in sorted order', () => {
    const map = buildSymbolMap([['d', 'u', '2'], ['a', 'T1']])
    expect(map).toEqual({ [PAD]: 0, [BOS]: 1, [EOS]: 2, '2': 3, T1: 4, a: 5, d: 6, u: 7 })
  })

  it('encodes as Piper does: BOS PAD (token PAD)* EOS', () => {
    const map = buildSymbolMap([['d', 'u', '2']])
    expect(encodeIds(['d', 'u', '2'], map)).toEqual([1, 0, 4, 0, 5, 0, 3, 0, 2])
    expect(() => encodeIds(['x'], map)).toThrow(/'x' is not in the symbol map/)
  })

  it('formats the phoneme_ids CSV: file|text|ids', () => {
    const csv = formatCsv([{ file: 'du2.wav', key: 'du2', text: 'd u 2', tokens: ['d', 'u', '2'], ids: [1, 0, 5, 0, 2] }])
    expect(csv).toBe('du2.wav|d u 2|1 0 5 0 2\n')
    expect(formatCsv([])).toBe('')
  })
})

describe('selectTrainingClips', () => {
  it('keeps the well-behaved corpus and drops what grading flags at z', () => {
    const clips = [
      ...corpus(),
      clip('sam1', 'quiet', { rmsDb: -40 }),
      clip('san1', 'silent', { f0Hz: null, voicedMs: null, onsetMs: null }),
    ]
    const { kept, dropped } = selectTrainingClips(clips, 3)
    expect(kept.map((c) => c.id)).toEqual(corpus().map((c) => c.id))
    expect(dropped).toEqual([
      { key: 'sam1', id: 'quiet', reason: expect.stringMatching(/^level -\d+\.\dσ$/) },
      { key: 'san1', id: 'silent', reason: 'no voiced frames' },
    ])
  })

  it('a looser z keeps more', () => {
    const clips = [...corpus(), clip('sam1', 'loudish', { rmsDb: -7 })]
    expect(selectTrainingClips(clips, 3).dropped.map((d) => d.id)).toEqual(['loudish'])
    expect(selectTrainingClips(clips, 10).dropped).toEqual([])
  })
})

describe('holdoutKeys', () => {
  it('is deterministic, sized by fraction, and independent of input order', () => {
    const keys = ['du2', 'dua7', 'iu5', 'a1', 'bhuê5', 'ng5', 'm6', 'ziah8', 'cên1', 'ngou2']
    const held = holdoutKeys(keys, 0.2)
    expect(held.size).toBe(2)
    expect(holdoutKeys([...keys].reverse(), 0.2)).toEqual(held)
    expect(holdoutKeys(keys, 0)).toEqual(new Set())
  })

  it("adding a syllable does not reshuffle another's rank", () => {
    const keys = ['du2', 'dua7', 'iu5', 'a1', 'bhuê5', 'ng5', 'm6', 'ziah8', 'cên1', 'ngou2']
    const before = holdoutKeys(keys, 0.3)
    const after = holdoutKeys([...keys, 'sim1'], 0.3)
    // At most one key crosses the boundary in either direction.
    expect([...before].filter((k) => !after.has(k)).length).toBeLessThanOrEqual(1)
  })

  it('fnv1a matches the reference vector', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
  })
})

describe('exportWav', () => {
  it('trims to the measured active region, pads both sides, resamples, writes float', () => {
    const calls: string[][] = []
    exportWav(clip('du2', 'sha-du2'), '/out/du2.wav', { sampleRate: 22050, padMs: 50 }, (args) => calls.push(args))
    expect(calls).toHaveLength(1)
    const args = calls[0]!
    expect(args.slice(0, 5)).toEqual(['-v', 'error', '-y', '-i', '/clips/sha-du2.webm'])
    expect(args[args.indexOf('-af') + 1]).toBe('atrim=start=0.200:end=0.800,asetpts=PTS-STARTPTS,adelay=50:all=1,apad=pad_dur=0.050')
    expect(args[args.indexOf('-ar') + 1]).toBe('22050')
    expect(args[args.indexOf('-c:a') + 1]).toBe('pcm_f32le')
    expect(args.at(-1)).toBe('/out/du2.wav')
  })
})

describe('writeDataset', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audio-tts-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes shared wavs, a CSV triple per scheme, and a report', () => {
    const clips = [...corpus(), clip('sam1', 'quiet', { rmsDb: -40 })]
    const wavs: string[] = []
    const report = writeDataset(
      { variety: 'chaozhou', manifestClips: clips.length + 5, clips, ipa: (s) => toIpa(s.raw).ipa },
      dir,
      { z: 3, holdout: 0.2, runFfmpeg: (args) => wavs.push(args.at(-1)!) },
    )

    expect(report.counts).toEqual({ manifest: 16, recordings: 11, kept: 10, dropped: 1, train: 8, holdout: 2 })
    expect(report.dropped.map((d) => d.key)).toEqual(['sam1'])
    expect(report.holdout).toHaveLength(2)
    expect(report.schemes.pengim.symbols).toBeGreaterThan(3)
    expect(report.schemes.ipa.symbols).toBeGreaterThan(3)
    expect(wavs).toHaveLength(10)
    expect(wavs).toContain(join(dir, 'wavs', 'sa1.wav'))

    for (const scheme of ['pengim', 'ipa'] as const) {
      const train = readFileSync(join(dir, scheme, 'metadata.csv'), 'utf8').trim().split('\n')
      const held = readFileSync(join(dir, scheme, 'holdout.csv'), 'utf8').trim().split('\n')
      expect(train).toHaveLength(8)
      expect(held).toHaveLength(2)
      for (const key of report.holdout) {
        expect(held.some((row) => row.startsWith(`${key}.wav|`))).toBe(true)
        expect(train.some((row) => row.startsWith(`${key}.wav|`))).toBe(false)
      }
      const phonemes = JSON.parse(readFileSync(join(dir, scheme, 'phonemes.json'), 'utf8')) as Record<string, number[]>
      expect(phonemes[PAD]).toEqual([0])
      expect(phonemes[BOS]).toEqual([1])
      expect(phonemes[EOS]).toEqual([2])
      // Every id in the CSV resolves in the map.
      const ids = new Set(Object.values(phonemes).flat())
      for (const row of [...train, ...held]) for (const id of row.split('|')[2]!.split(' ')) expect(ids.has(Number(id))).toBe(true)
    }
    expect(readFileSync(join(dir, 'ipa', 'metadata.csv'), 'utf8')).toMatch(/^sa1\.wav\|s a T1\|/mu)
    expect(existsSync(join(dir, 'dataset.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'dataset.json'), 'utf8')).params).toEqual({ z: 3, holdout: 0.2, sampleRate: 22050, padMs: 50 })
  })

  it('names a second take of the same syllable distinctly', () => {
    const clips = [...corpus(), clip('sa1', 'second-take')]
    const wavs: string[] = []
    writeDataset({ variety: 'chaozhou', manifestClips: 11, clips, ipa: (s) => toIpa(s.raw).ipa }, dir, {
      holdout: 0,
      runFfmpeg: (args) => wavs.push(args.at(-1)!),
    })
    expect(wavs).toContain(join(dir, 'wavs', 'sa1.wav'))
    expect(wavs).toContain(join(dir, 'wavs', 'sa1~1.wav'))
    expect(readFileSync(join(dir, 'pengim', 'metadata.csv'), 'utf8')).toMatch(/^sa1~1\.wav\|s a 1\|/mu)
  })
})
