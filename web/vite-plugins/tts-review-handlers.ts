import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { AUDIO_TTS_DIR } from '../../src/paths.js'

/**
 * Pure request handlers behind the dev-only `/api/tts-review` route (issue
 * #260): a blind A/B listening test between a generated clip and the
 * recording it was supposed to sound like. Kept separate from
 * `tts-review.ts`'s Vite/HTTP wiring so the pairing, blinding and verdict
 * storage are unit-testable without a running server — the same split
 * `local-recordings-handlers.ts` uses.
 *
 * **Why blind.** `npm run audio:grade -- --dir` and UTMOS can both say a
 * clip sits close to the corpus; neither can say whether it sounds *right*,
 * and TTS.md §4a's verdict rests on nothing else. A sighted comparison would
 * not fix that: told which clip is synthetic, a listener finds artifacts in
 * it — including in the ones that aren't. So the two clips arrive as `a` and
 * `b` in an order derived from the syllable and set, the audio URLs name
 * only the side, and which was which is revealed only in the response to the
 * verdict that judged them.
 *
 * **What is compared.** The generated WAV against the *exported* original
 * (`<variety>/wavs/<key>.wav`), not the published clip: the exporter already
 * trimmed both to the same silence bound, padded them the same, and
 * resampled to the same rate, so the only difference left is the audio
 * itself. Comparing against the published WebM would mostly measure its
 * ~400 ms of leading dead air.
 */

export const VARIETY = 'chaozhou'

/** Where generated sets are looked for, relative to `.cache/audio-tts/`. */
const SET_ROOTS = ['eval', 'sweep', 'runs']

export interface ReviewSet {
  /** `sweep/pengim-1.3` — the path under `.cache/audio-tts/`, and the id in review.json. */
  id: string
  /** Syllables that have both a generated clip and an exported original. */
  count: number
}

export interface ReviewItem {
  key: string
  /** Opaque: `/api/tts-review/audio/<setId>/<key>/a`. Which side is generated is not said. */
  aUrl: string
  bUrl: string
  verdict: Verdict | null
}

export type Preference = 'a' | 'b' | 'neither'
export type Quality = 'indistinguishable' | 'acceptable' | 'worse' | 'unusable'

export interface Verdict {
  /** Which side the listener preferred, as they saw it. */
  preferred: Preference
  quality: Quality
  note?: string
  /** Resolved at save time so the record survives a change to the blinding. */
  preferredGenerated: boolean | null
  generatedSide: 'a' | 'b'
  at: string
}

export interface ReviewFile {
  version: 1
  verdicts: Record<string, Record<string, Verdict>>
}

export interface ReviewDeps {
  /** Overridable for tests; defaults to `.cache/audio-tts/`. */
  ttsDir?: string
}

function ttsDir(deps: ReviewDeps): string {
  return deps.ttsDir ?? AUDIO_TTS_DIR
}

function originalsDir(deps: ReviewDeps): string {
  return join(ttsDir(deps), VARIETY, 'wavs')
}

export function reviewFilePath(deps: ReviewDeps = {}): string {
  return join(ttsDir(deps), 'review.json')
}

export function readReviewFile(deps: ReviewDeps = {}): ReviewFile {
  const path = reviewFilePath(deps)
  if (!existsSync(path)) return { version: 1, verdicts: {} }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ReviewFile>
  return raw.version === 1 && raw.verdicts ? (raw as ReviewFile) : { version: 1, verdicts: {} }
}

/**
 * FNV-1a over `<setId>/<key>` decides which side the generated clip takes.
 * Deterministic so a reload, or a resumed session, shows the same pairing
 * the earlier verdicts were made under — and so a listener cannot learn the
 * answer by reloading.
 */
export function generatedSide(setId: string, key: string): 'a' | 'b' {
  let hash = 0x811c9dc5
  for (const byte of Buffer.from(`${setId}/${key}`, 'utf8')) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash & 1) === 0 ? 'a' : 'b'
}

/** Empty for anything that is not a readable directory — `.cache` holds loose files too. */
function wavKeys(dir: string): string[] {
  if (!isDirectory(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.wav'))
    .map((f) => basename(f, '.wav'))
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Every directory under `eval/`, `sweep/` or `runs/*` holding generated WAVs. */
export function listSets(deps: ReviewDeps = {}): ReviewSet[] {
  const root = ttsDir(deps)
  const originals = new Set(wavKeys(originalsDir(deps)))
  const candidates: string[] = []
  for (const group of SET_ROOTS) {
    const groupDir = join(root, group)
    if (!isDirectory(groupDir)) continue
    for (const name of readdirSync(groupDir)) {
      const nested = join(groupDir, name)
      if (!isDirectory(nested)) continue // `.cache/audio-tts/eval/holdout.txt` and friends
      candidates.push(`${group}/${name}`)
      // One level deeper, for `runs/<scheme>/<output dir>`.
      if (wavKeys(nested).length === 0) {
        for (const sub of readdirSync(nested)) {
          if (isDirectory(join(nested, sub))) candidates.push(`${group}/${name}/${sub}`)
        }
      }
    }
  }
  return candidates
    .map((id) => ({ id, count: wavKeys(join(root, id)).filter((k) => originals.has(k)).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** The comparable syllables in `setId`, with any verdict already recorded. */
export function listItems(setId: string, deps: ReviewDeps = {}): { ok: true; items: ReviewItem[] } | { ok: false; error: string } {
  if (!listSets(deps).some((s) => s.id === setId)) return { ok: false, error: `unknown set: ${setId}` }
  const originals = new Set(wavKeys(originalsDir(deps)))
  const verdicts = readReviewFile(deps).verdicts[setId] ?? {}
  const items = wavKeys(join(ttsDir(deps), setId))
    .filter((key) => originals.has(key))
    .sort()
    .map((key) => ({
      key,
      aUrl: `/api/tts-review/audio/${encodeURIComponent(setId)}/${encodeURIComponent(key)}/a`,
      bUrl: `/api/tts-review/audio/${encodeURIComponent(setId)}/${encodeURIComponent(key)}/b`,
      verdict: verdicts[key] ?? null,
    }))
  return { ok: true, items }
}

/**
 * The WAV a side resolves to. Returns null rather than a path for anything
 * that escapes the two known directories — `setId` reaches the filesystem,
 * and this route exists only because a dev server is running.
 *
 * Both sides resolve or neither does, deliberately: a syllable that was
 * generated but never recorded (or the reverse) would otherwise answer 404
 * on one side and 200 on the other, which says which side is the generated
 * one — the single thing this route exists to keep quiet.
 */
export function resolveAudio(setId: string, key: string, side: 'a' | 'b', deps: ReviewDeps = {}): string | null {
  if (!listSets(deps).some((s) => s.id === setId)) return null
  if (!/^[^/\\]+$/u.test(key) || key === '.' || key === '..') return null
  const generated = join(ttsDir(deps), setId, `${key}.wav`)
  const original = join(originalsDir(deps), `${key}.wav`)
  if (!existsSync(generated) || !existsSync(original)) return null
  return generatedSide(setId, key) === side ? generated : original
}

/**
 * Both sides re-encoded to the same canonical 16-bit mono WAV.
 *
 * The exporter writes originals as float32 (`pcm_f32le`) and `tts synth`
 * writes generated clips as 16-bit, so serving the files as they sit on disk
 * makes one side roughly twice the size of the other — which answers the
 * question this route exists to keep quiet, to anyone who glances at a
 * network panel. Converting on the way out costs nothing at this size (a
 * syllable is tens of kilobytes) and leaves only differences a listener is
 * supposed to hear, like duration.
 *
 * Deliberately minimal: these two shapes are the only ones this route ever
 * serves, both produced by tooling in this repository, so an unexpected
 * format is a bug to surface rather than a case to handle.
 */
export function toCanonicalWav(bytes: Buffer): Buffer {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a WAV file')
  }

  // Walk the chunk list rather than assuming a 44-byte header: ffmpeg emits a
  // LIST/INFO chunk before `data`.
  let format = -1
  let channels = 1
  let sampleRate = 0
  let bitsPerSample = 0
  let data: Buffer | null = null
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = bytes.toString('ascii', at, at + 4)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ') {
      format = view.getUint16(body, true)
      channels = view.getUint16(body + 2, true)
      sampleRate = view.getUint32(body + 4, true)
      bitsPerSample = view.getUint16(body + 14, true)
    } else if (id === 'data') {
      data = bytes.subarray(body, Math.min(body + size, bytes.length))
    }
    at = body + size + (size % 2) // chunks are word-aligned
  }
  if (data === null || sampleRate === 0) throw new Error('WAV has no fmt/data chunk')

  let samples: Int16Array
  if (format === 3 && bitsPerSample === 32) {
    const floats = new Float32Array(data.buffer, data.byteOffset, Math.floor(data.length / 4))
    samples = new Int16Array(floats.length)
    for (let i = 0; i < floats.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, floats[i]!))
      samples[i] = Math.round(clamped * 32767)
    }
  } else if (format === 1 && bitsPerSample === 16) {
    samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2))
  } else {
    throw new Error(`unsupported WAV: format ${format}, ${bitsPerSample}-bit`)
  }

  const out = Buffer.alloc(44 + samples.length * 2)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + samples.length * 2, 4)
  out.write('WAVEfmt ', 8, 'ascii')
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20) // PCM
  out.writeUInt16LE(channels, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * channels * 2, 28) // byte rate
  out.writeUInt16LE(channels * 2, 32) // block align
  out.writeUInt16LE(16, 34)
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(samples.length * 2, 40)
  Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2).copy(out, 44)
  return out
}

export interface SaveVerdictBody {
  setId?: unknown
  key?: unknown
  preferred?: unknown
  quality?: unknown
  note?: unknown
}

const PREFERENCES: Preference[] = ['a', 'b', 'neither']
const QUALITIES: Quality[] = ['indistinguishable', 'acceptable', 'worse', 'unusable']

export type SaveVerdictResult =
  | { ok: true; verdict: Verdict }
  | { ok: false; error: string }

/** Records one verdict and reveals which side was generated. */
export function saveVerdict(body: SaveVerdictBody, deps: ReviewDeps = {}): SaveVerdictResult {
  const { setId, key, preferred, quality, note } = body
  if (typeof setId !== 'string' || typeof key !== 'string') return { ok: false, error: 'setId and key are required' }
  if (typeof preferred !== 'string' || !PREFERENCES.includes(preferred as Preference)) {
    return { ok: false, error: `preferred must be one of ${PREFERENCES.join(', ')}` }
  }
  if (typeof quality !== 'string' || !QUALITIES.includes(quality as Quality)) {
    return { ok: false, error: `quality must be one of ${QUALITIES.join(', ')}` }
  }
  if (note !== undefined && typeof note !== 'string') return { ok: false, error: 'note must be a string' }
  if (resolveAudio(setId, key, 'a', deps) === null) return { ok: false, error: `nothing to review at ${setId}/${key}` }

  const side = generatedSide(setId, key)
  const verdict: Verdict = {
    preferred: preferred as Preference,
    quality: quality as Quality,
    ...(note ? { note } : {}),
    preferredGenerated: preferred === 'neither' ? null : preferred === side,
    generatedSide: side,
    at: new Date().toISOString(),
  }
  const file = readReviewFile(deps)
  file.verdicts[setId] = { ...(file.verdicts[setId] ?? {}), [key]: verdict }
  writeFileSync(reviewFilePath(deps), JSON.stringify(file, null, 2))
  return { ok: true, verdict }
}

export interface SetSummary {
  n: number
  preferredGenerated: number
  preferredOriginal: number
  noPreference: number
  quality: Record<Quality, number>
}

/**
 * What the verdicts add up to. `preferredGenerated` near half of the decided
 * pairs is the interesting result — it means the listener could not reliably
 * tell the generated clip from the recording.
 */
export function summarise(setId: string, deps: ReviewDeps = {}): SetSummary {
  const verdicts = Object.values(readReviewFile(deps).verdicts[setId] ?? {})
  const quality = Object.fromEntries(QUALITIES.map((q) => [q, 0])) as Record<Quality, number>
  for (const v of verdicts) quality[v.quality] += 1
  return {
    n: verdicts.length,
    preferredGenerated: verdicts.filter((v) => v.preferredGenerated === true).length,
    preferredOriginal: verdicts.filter((v) => v.preferredGenerated === false).length,
    noPreference: verdicts.filter((v) => v.preferredGenerated === null).length,
    quality,
  }
}
