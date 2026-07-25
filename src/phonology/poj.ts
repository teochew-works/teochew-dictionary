import { loadPengimScheme, loadPojScheme } from './load.js'
import { parsePengim, type Syllable } from './syllable.js'
import type { PengimScheme, PojScheme } from '../schema/phonology.js'

/**
 * Peng'im → Pe̍h-ōe-jī transliteration.
 *
 * Purely orthographic, so unlike IPA it is variety-independent: it re-spells the
 * same phonological analysis in the diacritic convention familiar to Hokkien
 * readers and to much of the diaspora.
 */

/**
 * POJ tone-mark placement. The classical rule is "mark a, else o, else e, else
 * u, else i" — with the well-known exception that in the rimes `iu` and `ui` the
 * mark goes on the SECOND vowel (iû, uì), not on the one priority would pick.
 */
function toneVowelIndex(vowels: string, priority: string[]): number {
  if (vowels === 'iu' || vowels === 'ui') return 1
  for (const v of priority) {
    const i = vowels.indexOf(v)
    if (i !== -1) return i
  }
  return 0
}

function applyToneMark(vowels: string, combining: string, priority: string[]): string {
  if (combining === '') return vowels
  const i = toneVowelIndex(vowels, priority)
  const chars = [...vowels]
  const target = chars[i]
  if (target === undefined) return vowels
  chars[i] = (target + combining).normalize('NFC')
  return chars.join('')
}

function syllableToPoj(s: Syllable, poj: PojScheme): string {
  const tone = poj.tones[String(s.tone)]
  if (!tone) throw new Error(`POJ scheme has no mapping for tone ${s.tone}`)

  let out = ''
  if (s.initial) {
    const m = poj.initials[s.initial]
    if (m === undefined) throw new Error(`POJ scheme has no mapping for initial '${s.initial}'`)
    out += m
  }

  // Syllabic nasals carry the tone mark on the nasal itself, and may follow an
  // initial (飯 bng6 → pnḡ).
  if (s.syllabic) {
    const letter = poj.initials[s.nucleus]
    if (letter === undefined) throw new Error(`POJ scheme has no mapping for syllabic '${s.nucleus}'`)
    return (out + applyToneMark(letter, tone.combining, poj.tone_vowel_priority)).normalize('NFC')
  }

  let vowels = ''
  if (s.medial) {
    const m = poj.medials[s.medial]
    if (m === undefined) throw new Error(`POJ scheme has no mapping for medial '${s.medial}'`)
    vowels += m
  }
  const nuc = poj.nuclei[s.nucleus]
  if (nuc === undefined) throw new Error(`POJ scheme has no mapping for nucleus '${s.nucleus}'`)
  vowels += nuc

  out += applyToneMark(vowels, tone.combining, poj.tone_vowel_priority)

  if (s.coda) {
    const m = poj.codas[s.coda]
    if (m === undefined) throw new Error(`POJ scheme has no mapping for coda '${s.coda}'`)
    out += m
  }

  // POJ marks nasalisation with a superscript n at the end of the syllable.
  if (s.nasalised) out += poj.nasalisation

  return out.normalize('NFC')
}

/**
 * Derive POJ for a whole Peng'im word.
 *
 * POJ joins the syllables of a word with hyphens, which is also how it encodes
 * word boundaries — so this is not merely cosmetic.
 */
export function toPoj(pengim: string): string {
  const scheme: PengimScheme = loadPengimScheme()
  const poj = loadPojScheme()
  return parsePengim(pengim, scheme)
    .map((s) => syllableToPoj(s, poj))
    .join('-')
}

/** Derive POJ from already-parsed syllables, reusing loaded tables. */
export function syllablesToPoj(syllables: Syllable[], poj: PojScheme): string {
  return syllables.map((s) => syllableToPoj(s, poj)).join('-')
}
