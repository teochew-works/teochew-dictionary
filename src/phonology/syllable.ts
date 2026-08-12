import { loadPengimScheme } from './load.js'
import type { PengimScheme } from '../schema/phonology.js'

/**
 * Peng'im syllable parsing.
 *
 * A syllable is `initial? medial? nucleus nasalisation? coda? tone`.
 *
 * Two ambiguities in the orthography need deliberate handling, both documented
 * in data/phonology/pengim.yaml so the code and the spec cannot drift:
 *
 *  1. Initials must be matched longest-first, or `bh`/`gh`/`ng` are mis-split
 *     (`bho5` would parse as b + ho).
 *  2. Teochew has no /n/ coda — it merged with /ŋ/. So a final `n` that is not
 *     part of `ng` marks nasalisation of the vowel, not a coda:
 *         in → /ĩ/       ing → /iŋ/
 *     Getting this backwards silently corrupts a large slice of the lexicon,
 *     which is why it is tested directly.
 */

export interface Syllable {
  /** The original syllable text, normalised to lowercase NFC. */
  raw: string
  initial: string | null
  medial: string | null
  /** Peng'im nucleus, or `m`/`ng` when the syllable is a syllabic nasal. */
  nucleus: string
  nasalised: boolean
  coda: string | null
  tone: number
  /** True for syllabic nasals such as 毋 `m6`, 黃 `ng5`. */
  syllabic: boolean
}

export class PengimError extends Error {
  constructor(
    message: string,
    readonly syllable: string,
  ) {
    super(`${message} (in '${syllable}')`)
    this.name = 'PengimError'
  }
}

/** Longest-first so digraphs beat their own prefixes. */
function byLengthDesc(a: string, b: string): number {
  return b.length - a.length || a.localeCompare(b)
}

interface Tables {
  initials: string[]
  medials: string[]
  nuclei: string[]
  codas: string[]
  checkedCodas: Set<string>
  syllabicNuclei: Set<string>
  nasalMarker: string
  toneIsChecked: Map<number, boolean>
}

function buildTables(scheme: PengimScheme): Tables {
  return {
    initials: scheme.initials.map((i) => i.pengim).sort(byLengthDesc),
    medials: [...scheme.medials].sort(byLengthDesc),
    nuclei: [...scheme.nuclei].sort(byLengthDesc),
    codas: [...scheme.codas].sort(byLengthDesc),
    checkedCodas: new Set(scheme.syllable.checked_codas),
    syllabicNuclei: new Set(scheme.syllable.syllabic_nuclei),
    nasalMarker: scheme.syllable.nasalisation_marker,
    toneIsChecked: new Map(scheme.tones.map((t) => [t.number, t.checked])),
  }
}

let cached: Tables | null = null
/**
 * Keyed by scheme object identity, so a caller that threads the same explicit
 * scheme through many parse calls (buildSyllableInventory's ~52k candidates,
 * enrich.ts's per-reading build) doesn't rebuild Tables — four sorts — from
 * scratch every time.
 */
const explicitCache = new WeakMap<PengimScheme, Tables>()

function tables(scheme?: PengimScheme): Tables {
  if (scheme) {
    let built = explicitCache.get(scheme)
    if (!built) {
      built = buildTables(scheme)
      explicitCache.set(scheme, built)
    }
    return built
  }
  cached ??= buildTables(loadPengimScheme())
  return cached
}

/** Test seam: drop the memoised scheme so a reload picks up edited data files. */
export function resetSchemeCache(): void {
  cached = null
}

function matchPrefix(input: string, candidates: string[]): string | null {
  for (const c of candidates) if (input.startsWith(c)) return c
  return null
}

function syllabic(
  raw: string,
  initial: string | null,
  nucleus: string,
  tone: number,
): Syllable {
  return { raw, initial, medial: null, nucleus, nasalised: false, coda: null, tone, syllabic: true }
}

/**
 * Parse a single Peng'im syllable, e.g. `dio5`, `ziah8`, `ng5`.
 * @throws {PengimError} if the syllable is not well-formed.
 */
export function parseSyllable(input: string, scheme?: PengimScheme): Syllable {
  const t = tables(scheme)
  const raw = input.normalize('NFC').toLowerCase().trim()
  if (raw.length === 0) throw new PengimError('empty syllable', input)

  // ── tone ────────────────────────────────────────────────────────────────────
  const toneChar = raw.at(-1)!
  if (!/[1-8]/u.test(toneChar)) {
    throw new PengimError('missing tone digit (expected 1–8 at the end)', input)
  }
  const tone = Number(toneChar)
  let rest = raw.slice(0, -1)
  if (rest.length === 0) throw new PengimError('tone digit with no syllable', input)
  if (/[0-9]/u.test(rest)) throw new PengimError('unexpected digit inside syllable', input)

  // ── initial ─────────────────────────────────────────────────────────────────
  const initial = matchPrefix(rest, t.initials)
  if (initial) rest = rest.slice(initial.length)

  // ── syllabic nasal ──────────────────────────────────────────────────────────
  // Two shapes: the nasal alone (黃 ng5, 毋 m6), where the initial matcher has
  // already consumed it; or an initial plus a nasal rime (飯 bng7, 方 bng1),
  // where the nasal is what remains after the initial.
  if (rest.length === 0) {
    if (initial && t.syllabicNuclei.has(initial)) {
      checkToneCoda(tone, null, t, input)
      return syllabic(raw, null, initial, tone)
    }
    throw new PengimError('syllable has an initial but no vowel', input)
  }
  if (t.syllabicNuclei.has(rest)) {
    checkToneCoda(tone, null, t, input)
    return syllabic(raw, initial, rest, tone)
  }

  // ── medial ──────────────────────────────────────────────────────────────────
  // Only treat i/u as a medial when a nucleus actually follows it; otherwise the
  // letter *is* the nucleus (`i1` → nucleus i, not medial i with nothing after).
  let medial: string | null = null
  const maybeMedial = matchPrefix(rest, t.medials)
  if (maybeMedial) {
    const after = rest.slice(maybeMedial.length)
    if (after.length > 0 && matchPrefix(after, t.nuclei)) {
      medial = maybeMedial
      rest = after
    }
  }

  // ── nucleus ─────────────────────────────────────────────────────────────────
  const nucleus = matchPrefix(rest, t.nuclei)
  if (!nucleus) throw new PengimError(`no vowel found at '${rest}'`, input)
  rest = rest.slice(nucleus.length)

  // ── nasalisation, then coda ─────────────────────────────────────────────────
  // Order matters: `ng` is a coda, but a bare `n` before end-or-stop is the
  // nasalisation marker. See the note at the top of this file.
  let nasalised = false
  if (rest.startsWith(t.nasalMarker) && !rest.startsWith('ng')) {
    nasalised = true
    rest = rest.slice(t.nasalMarker.length)
  }

  let coda: string | null = null
  if (rest.length > 0) {
    coda = matchPrefix(rest, t.codas)
    if (!coda) throw new PengimError(`unrecognised final '${rest}'`, input)
    rest = rest.slice(coda.length)
  }

  if (rest.length > 0) throw new PengimError(`trailing characters '${rest}'`, input)

  checkToneCoda(tone, coda, t, input)

  return { raw, initial, medial, nucleus, nasalised, coda, tone, syllabic: false }
}

/**
 * Tones 4 and 8 (入聲) occur only on syllables closed by a stop; the other six
 * occur only on open or nasal-closed syllables. This is a hard phonotactic
 * constraint and catches a lot of data-entry slips.
 */
function checkToneCoda(
  tone: number,
  coda: string | null,
  t: Tables,
  input: string,
): void {
  const toneChecked = t.toneIsChecked.get(tone) ?? false
  const codaChecked = coda !== null && t.checkedCodas.has(coda)
  if (toneChecked && !codaChecked) {
    throw new PengimError(
      `tone ${tone} is a checked (入聲) tone and requires a final stop (${[...t.checkedCodas].join('/')})`,
      input,
    )
  }
  if (!toneChecked && codaChecked) {
    throw new PengimError(
      `final stop '${coda}' requires a checked tone (4 or 8), not ${tone}`,
      input,
    )
  }
}

/** Parse a whitespace-separated Peng'im word into its syllables. */
export function parsePengim(input: string, scheme?: PengimScheme): Syllable[] {
  const parts = input.normalize('NFC').trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) throw new PengimError('empty Peng\'im string', input)
  return parts.map((p) => parseSyllable(p, scheme))
}

export type ParseResult =
  | { ok: true; syllables: Syllable[] }
  | { ok: false; error: string }

/** Non-throwing variant, for bulk validation where one bad row must not abort. */
export function tryParsePengim(input: string, scheme?: PengimScheme): ParseResult {
  try {
    return { ok: true, syllables: parsePengim(input, scheme) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Re-render a parsed syllable back to Peng'im. Round-trips `parseSyllable`. */
export function formatSyllable(s: Syllable): string {
  if (s.syllabic) return `${s.initial ?? ''}${s.nucleus}${s.tone}`
  return [
    s.initial ?? '',
    s.medial ?? '',
    s.nucleus,
    s.nasalised ? 'n' : '',
    s.coda ?? '',
    String(s.tone),
  ].join('')
}
