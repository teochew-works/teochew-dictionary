import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Syllable } from '../phonology/syllable.js'
import type { ClipFeatures } from './features.js'
import { gradeCorpus, type ClipGrade, type GradeInput } from './grade.js'
import { decodeToWav, type RunTool } from './resynth-tool.js'

/**
 * The training-set exporter for a phoneme-input VITS voice (issue #260):
 * manifest + cached bytes + cached features → the `phoneme_ids` dataset
 * layout `tools/tts/` trains from. Everything here is pure except
 * `writeDataset`, and that only shells out to ffmpeg through an injectable
 * seam — the same arrangement as ../audio/features.ts.
 *
 * Two token schemes are exported from one run, because which one to train on
 * is the A/B the issue asks for and the audio is identical either way:
 *
 * - `pengim`: the syllable key's NFC codepoints as-is, tone digit included —
 *   `cên1` → `c ê n 1`. Digraphs (`bh`, `ng`) are two tokens; the model
 *   learns them from context, as the LREC-COLING 2024 Teochew VITS did from
 *   romanised text.
 * - `ipa`: the derived IPA (ADR-0001) split into grapheme clusters, with the
 *   Chao tone letters replaced by one explicit tone token — `tsʰẽ³³` →
 *   `t s ʰ ẽ T1`. A nasal vowel or a syllabic nasal (`ẽ`, `ŋ̩`) stays one
 *   token because its combining mark travels with its base.
 *
 * Ids follow Piper's own convention (`piper.phoneme_ids.phonemes_to_ids`):
 * BOS, PAD, then every token followed by PAD, then EOS — so a checkpoint
 * trained on these ids is a normal Piper voice whose `phoneme_id_map` is the
 * `phonemes.json` written beside the CSV.
 *
 * Which clips train is decided by the same grades `npm run audio:grade`
 * prints: only human recordings (a clip with `synthesis` is a render of one
 * that is already in the set), and none that grading flags at `--z` —
 * a >3σ take is exactly what the model should not learn. The hold-out is by
 * *syllable*, not by clip: a syllable the model never saw is the closest
 * honest proxy for "a syllable with no recording", and generating those for
 * evaluation publishes nothing (ADR-0027 still forbids publishing them).
 */

export type TokenScheme = 'pengim' | 'ipa'
export const TOKEN_SCHEMES: readonly TokenScheme[] = ['pengim', 'ipa']

export const PAD = '_'
export const BOS = '^'
export const EOS = '$'
/** Piper reserves ids 0–2; every real token is numbered after them. */
const RESERVED: Record<string, number> = { [PAD]: 0, [BOS]: 1, [EOS]: 2 }

export const DEFAULT_TRAINING_Z = 3
export const DEFAULT_HOLDOUT_FRACTION = 0.05
export const DEFAULT_SAMPLE_RATE = 22_050
export const DEFAULT_PAD_MS = 50

const SUPERSCRIPT_DIGITS = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/gu
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })

/** `cên1` → `['c', 'ê', 'n', '1']`. */
export function pengimTokens(key: string): string[] {
  return [...key.normalize('NFC')]
}

/** `tsʰẽ³³` + tone 1 → `['t', 's', 'ʰ', 'ẽ', 'T1']`. */
export function ipaTokens(ipa: string, tone: number): string[] {
  const segments = ipa.normalize('NFC').replace(SUPERSCRIPT_DIGITS, '')
  return [...[...segmenter.segment(segments)].map((s) => s.segment).filter((s) => s.trim() !== ''), `T${tone}`]
}

export function tokenise(scheme: TokenScheme, syllable: Syllable, ipa: string): string[] {
  return scheme === 'pengim' ? pengimTokens(syllable.raw) : ipaTokens(ipa, syllable.tone)
}

/** Every distinct token, numbered after the reserved three in sorted order. */
export function buildSymbolMap(tokenLists: readonly (readonly string[])[]): Record<string, number> {
  const symbols = [...new Set(tokenLists.flat())].filter((s) => !(s in RESERVED)).sort()
  return { ...RESERVED, ...Object.fromEntries(symbols.map((s, i) => [s, i + 3])) }
}

/** `^ _ t _ u _ T2 _ $`, as Piper's `phonemes_to_ids` lays it out. */
export function encodeIds(tokens: readonly string[], symbols: Record<string, number>): number[] {
  const id = (s: string): number => {
    const v = symbols[s]
    if (v === undefined) throw new Error(`token '${s}' is not in the symbol map`)
    return v
  }
  return [id(BOS), id(PAD), ...tokens.flatMap((t) => [id(t), id(PAD)]), id(EOS)]
}

export interface DatasetClip {
  key: string
  /** Bare sha256 of the source clip — the clip-cache key. */
  id: string
  webmPath: string
  syllable: Syllable
  features: ClipFeatures
}

export interface Dropped {
  key: string
  id: string
  reason: string
}

export interface Selection {
  kept: DatasetClip[]
  dropped: Dropped[]
}

/**
 * Keeps every clip `audio:grade` would not flag at `z`. Flags that are not
 * σ-based (no voiced frames, barely voiced) drop a clip too — the model
 * has nothing to learn from a mis-trigger either.
 */
export function selectTrainingClips(clips: DatasetClip[], z: number = DEFAULT_TRAINING_Z): Selection {
  const inputs: GradeInput[] = clips.map((c) => ({ key: c.key, id: c.id, features: c.features }))
  const grades = new Map<string, ClipGrade>(gradeCorpus(inputs, { outlierZ: z }).clips.map((g) => [g.id, g]))
  const kept: DatasetClip[] = []
  const dropped: Dropped[] = []
  for (const clip of clips) {
    const grade = grades.get(clip.id)!
    if (grade.flags.length === 0) kept.push(clip)
    else dropped.push({ key: clip.key, id: clip.id, reason: grade.flags.join('; ') })
  }
  return { kept, dropped }
}

/** FNV-1a over UTF-8 — a stable, dependency-free rank for the hold-out draw. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (const byte of Buffer.from(text, 'utf8')) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * The syllables to hold out: the `fraction` of `keys` whose hash ranks
 * lowest. Deterministic for a given key set, and a key's rank does not
 * depend on which other keys are present, so adding a syllable to the
 * corpus moves at most one other syllable across the boundary.
 */
export function holdoutKeys(keys: readonly string[], fraction: number = DEFAULT_HOLDOUT_FRACTION): Set<string> {
  const unique = [...new Set(keys)]
  const count = Math.round(unique.length * fraction)
  const ranked = unique.map((key) => ({ key, rank: fnv1a(key) })).sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
  return new Set(ranked.slice(0, count).map((r) => r.key))
}

export interface DatasetRow {
  /** WAV filename under `wavs/`. */
  file: string
  key: string
  text: string
  tokens: string[]
  ids: number[]
}

/** `du2.wav|du2|1 0 17 0 ... 2` — Piper's `phoneme_ids` CSV: `utt|text|ids`. */
export function formatCsv(rows: readonly DatasetRow[]): string {
  return rows.map((r) => `${r.file}|${r.text}|${r.ids.join(' ')}`).join('\n') + (rows.length > 0 ? '\n' : '')
}

export interface WavParams {
  sampleRate: number
  padMs: number
}

/**
 * One clip → one WAV: decoded, cut to the active region the features cache
 * measured (the same −30 dB bound the manifest's trims use), padded with
 * `padMs` of silence either side like an ADR-0027 render, mono float at
 * `sampleRate` (several recordings decode a touch above 0 dBFS, and Piper
 * peak-normalises anyway). Piper's own VAD trim is turned off for this
 * dataset so the two agree on where a syllable starts.
 */
export function exportWav(clip: DatasetClip, wavPath: string, params: WavParams, runFfmpeg?: RunTool): void {
  const { startMs, endMs } = clip.features.trim
  const pad = params.padMs / 1000
  const filter = [
    `atrim=start=${(startMs / 1000).toFixed(3)}:end=${(endMs / 1000).toFixed(3)}`,
    'asetpts=PTS-STARTPTS',
    `adelay=${params.padMs}:all=1`,
    `apad=pad_dur=${pad.toFixed(3)}`,
  ].join(',')
  decodeToWav(clip.webmPath, wavPath, runFfmpeg, { filter, sampleRate: params.sampleRate, float: true })
}

export interface DatasetReport {
  version: 1
  generated: string
  variety: string
  params: { z: number; holdout: number; sampleRate: number; padMs: number }
  counts: { manifest: number; recordings: number; kept: number; dropped: number; train: number; holdout: number }
  holdout: string[]
  dropped: Dropped[]
  schemes: Record<TokenScheme, { symbols: number }>
}

export interface WriteDatasetOptions {
  z?: number
  holdout?: number
  sampleRate?: number
  padMs?: number
  runFfmpeg?: RunTool
  onProgress?: (done: number, total: number) => void
}

export interface WriteDatasetInput {
  variety: string
  /** How many clips the manifest holds in all, for the report; renders included. */
  manifestClips: number
  /** Human recordings only — a render (`synthesis`) is a re-take of one already here. */
  clips: DatasetClip[]
  /** Derived IPA per syllable. */
  ipa: (syllable: Syllable) => string
}

/**
 * Writes `<outDir>/wavs/<key>.wav` once, `<outDir>/<scheme>/{metadata.csv,
 * holdout.csv, phonemes.json}` per scheme, and `<outDir>/dataset.json`.
 * The wavs directory is shared: the schemes differ only in text.
 */
export function writeDataset(input: WriteDatasetInput, outDir: string, options: WriteDatasetOptions = {}): DatasetReport {
  const { z = DEFAULT_TRAINING_Z, holdout = DEFAULT_HOLDOUT_FRACTION, sampleRate = DEFAULT_SAMPLE_RATE, padMs = DEFAULT_PAD_MS } = options
  const selection = selectTrainingClips(input.clips, z)
  const held = holdoutKeys(selection.kept.map((c) => c.key), holdout)

  const wavsDir = join(outDir, 'wavs')
  mkdirSync(wavsDir, { recursive: true })
  const seen = new Map<string, number>()
  const files = new Map<string, string>()
  for (const [i, clip] of selection.kept.entries()) {
    // One WAV per clip: a second recording of the same syllable gets a suffix.
    const n = seen.get(clip.key) ?? 0
    seen.set(clip.key, n + 1)
    const file = n === 0 ? `${clip.key}.wav` : `${clip.key}~${n}.wav`
    files.set(clip.id, file)
    exportWav(clip, join(wavsDir, file), { sampleRate, padMs }, options.runFfmpeg)
    options.onProgress?.(i + 1, selection.kept.length)
  }

  const schemes = {} as DatasetReport['schemes']
  for (const scheme of TOKEN_SCHEMES) {
    const tokensOf = (clip: DatasetClip): string[] => tokenise(scheme, clip.syllable, input.ipa(clip.syllable))
    const symbols = buildSymbolMap(selection.kept.map(tokensOf))
    const rows = selection.kept.map((clip): DatasetRow => {
      const tokens = tokensOf(clip)
      return { file: files.get(clip.id)!, key: clip.key, text: tokens.join(' '), tokens, ids: encodeIds(tokens, symbols) }
    })
    const dir = join(outDir, scheme)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'metadata.csv'), formatCsv(rows.filter((r) => !held.has(r.key))))
    writeFileSync(join(dir, 'holdout.csv'), formatCsv(rows.filter((r) => held.has(r.key))))
    // Piper's map values are id *lists* (a phoneme may expand to several ids).
    writeFileSync(join(dir, 'phonemes.json'), JSON.stringify(Object.fromEntries(Object.entries(symbols).map(([s, id]) => [s, [id]])), null, 2))
    schemes[scheme] = { symbols: Object.keys(symbols).length }
  }

  const heldClips = selection.kept.filter((c) => held.has(c.key)).length
  const report: DatasetReport = {
    version: 1,
    generated: new Date().toISOString(),
    variety: input.variety,
    params: { z, holdout, sampleRate, padMs },
    counts: {
      manifest: input.manifestClips,
      recordings: input.clips.length,
      kept: selection.kept.length,
      dropped: selection.dropped.length,
      train: selection.kept.length - heldClips,
      holdout: heldClips,
    },
    holdout: [...held].sort(),
    dropped: selection.dropped,
    schemes,
  }
  writeFileSync(join(outDir, 'dataset.json'), JSON.stringify(report, null, 2))
  return report
}
