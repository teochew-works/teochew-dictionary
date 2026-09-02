import type { Syllable } from './syllable.js'
import type { Confidence, PengimScheme, Variety } from '../schema/phonology.js'

/**
 * Derive IPA from Peng'im for a given variety.
 *
 * Composition is `initial + medial + nucleus(+ nasal tilde) + coda + tone`, with
 * a whole-rime escape hatch (`irregular` in the variety file) for sequences the
 * compositional rules get wrong — notably 潮 `dio`, which is [tie] in Chaozhou
 * city but [tio] in Shantou.
 *
 * Every derivation also reports the weakest confidence of the mappings it used,
 * so downstream consumers can decide whether to present a form as authoritative.
 *
 * Pure: takes an already-loaded `Variety`/`PengimScheme` rather than loading
 * one from disk. The root project's `src/phonology/ipa.ts` adds `toIpa`, a
 * disk-backed convenience wrapper around `syllablesToIpa` below — see that
 * file's doc comment.
 */

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 }

export interface IpaResult {
  ipa: string
  /** Weakest confidence among the mappings used. */
  confidence: Confidence
  /** Notes attached to any non-`high` mapping used, for surfacing in review. */
  caveats: string[]
}

function toneLetters(contour: string): string {
  return [...contour].map((d) => SUPERSCRIPT[d] ?? d).join('')
}

function nasalise(vowels: string, combining: string): string {
  // Place the combining tilde after each vowel character of the rime nucleus.
  return [...vowels].map((ch) => ch + combining).join('')
}

class Accumulator {
  private rank = CONFIDENCE_RANK.high
  readonly caveats: string[] = []

  note(confidence: Confidence, note?: string): void {
    this.rank = Math.min(this.rank, CONFIDENCE_RANK[confidence])
    if (confidence !== 'high' && note) this.caveats.push(note.trim())
  }

  get confidence(): Confidence {
    return (['low', 'medium', 'high'] as const)[this.rank] ?? 'low'
  }
}

/** The Peng'im rime of a syllable: medial + nucleus + nasal marker + coda. */
export function rimeOf(s: Syllable): string {
  if (s.syllabic) return s.nucleus
  return `${s.medial ?? ''}${s.nucleus}${s.nasalised ? 'n' : ''}${s.coda ?? ''}`
}

function syllableToIpa(
  s: Syllable,
  variety: Variety,
  scheme: PengimScheme,
  acc: Accumulator,
): string {
  const contour =
    variety.tones?.[String(s.tone)] ??
    scheme.tones.find((t) => t.number === s.tone)?.contour ??
    ''

  let out = ''

  if (s.initial) {
    const m = variety.initials?.[s.initial]
    if (!m) throw new Error(`variety '${variety.variety.id}' has no mapping for initial '${s.initial}'`)
    acc.note(m.confidence, m.note)
    out += m.ipa
  }

  // Syllabic nasals: the nucleus is itself a consonant, carrying the syllabicity
  // diacritic. It may follow an initial (飯 bng7 → [pŋ̍]).
  if (s.syllabic) {
    const m = variety.initials?.[s.nucleus]
    if (!m) throw new Error(`variety '${variety.variety.id}' has no mapping for syllabic '${s.nucleus}'`)
    acc.note(m.confidence, m.note)
    return `${out}${m.ipa}̩${toneLetters(contour)}` // U+0329 COMBINING VERTICAL LINE BELOW
  }

  // Whole-rime override wins over compositional derivation.
  const rime = rimeOf(s)
  const irregular = variety.irregular?.[rime]
  if (irregular) {
    acc.note(irregular.confidence, irregular.note)
    return out + irregular.ipa + toneLetters(contour)
  }

  let vowels = ''
  if (s.medial) {
    const m = variety.medials?.[s.medial]
    if (!m) throw new Error(`variety '${variety.variety.id}' has no mapping for medial '${s.medial}'`)
    acc.note(m.confidence, m.note)
    vowels += m.ipa
  }

  const nuc = variety.nuclei?.[s.nucleus]
  if (!nuc) throw new Error(`variety '${variety.variety.id}' has no mapping for nucleus '${s.nucleus}'`)
  acc.note(nuc.confidence, nuc.note)
  vowels += nuc.ipa

  if (s.nasalised) {
    const n = variety.nasalisation
    if (!n) throw new Error(`variety '${variety.variety.id}' defines no nasalisation mark`)
    acc.note(n.confidence)
    vowels = nasalise(vowels, n.combining)
  }
  out += vowels

  if (s.coda) {
    const m = variety.codas?.[s.coda]
    if (!m) throw new Error(`variety '${variety.variety.id}' has no mapping for coda '${s.coda}'`)
    acc.note(m.confidence, m.note)
    out += m.ipa
  }

  return out + toneLetters(contour)
}

/**
 * Composed IPA is normalised to NFC so that, say, a + U+0303 becomes precomposed
 * ã. Without this, derived strings would not compare equal to the same text
 * typed by hand, which breaks both tests and any downstream search index.
 */
function render(
  syllables: Syllable[],
  variety: Variety,
  scheme: PengimScheme,
  acc: Accumulator,
): string {
  return syllables
    .map((s) => syllableToIpa(s, variety, scheme, acc))
    .join(' ')
    .normalize('NFC')
}

/** Derive IPA from already-parsed syllables, reusing loaded tables. */
export function syllablesToIpa(
  syllables: Syllable[],
  variety: Variety,
  scheme: PengimScheme,
): IpaResult {
  const acc = new Accumulator()
  const ipa = render(syllables, variety, scheme, acc)
  return { ipa, confidence: acc.confidence, caveats: [...new Set(acc.caveats)] }
}
