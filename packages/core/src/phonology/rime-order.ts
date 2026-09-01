import type { PengimScheme } from '../schema/phonology.js'
import { rimeOf } from './ipa.js'
import type { Syllable } from './syllable.js'

/**
 * Phonological ordering for the Sounds tab's Chart view rows (issue #171):
 * grouped by nucleus (in `pengim.yaml`'s declared `nuclei` order), then
 * medial, then plain-vs-nasalised, then coda kind (open → nasal → stop),
 * then coda. Syllabic nasals (`m`, `ng`) have no nucleus/medial/coda of
 * their own, so they sort in their own bucket after every vowel-final rime,
 * ordered by `syllable.syllabic_nuclei`.
 *
 * Throws on an unrecognised coda rather than defaulting silently — a rime
 * whose coda kind can't be determined must fail loudly, not sort
 * arbitrarily (which would be indistinguishable from a rime quietly
 * vanishing from the grid).
 */
export function rimeSortKey(s: Syllable, scheme: PengimScheme): number[] {
  if (s.syllabic) {
    const idx = scheme.syllable.syllabic_nuclei.indexOf(s.nucleus)
    if (idx === -1) throw new Error(`rimeSortKey: syllabic nucleus '${s.nucleus}' is not in syllable.syllabic_nuclei`)
    return [1, idx]
  }

  const nucleusIdx = scheme.nuclei.indexOf(s.nucleus)
  if (nucleusIdx === -1) throw new Error(`rimeSortKey: nucleus '${s.nucleus}' is not in the declared nuclei list`)

  const medialIdx = s.medial === null ? 0 : 1 + scheme.medials.indexOf(s.medial)
  if (s.medial !== null && medialIdx === 0) {
    throw new Error(`rimeSortKey: medial '${s.medial}' is not in the declared medials list`)
  }

  const nasalRank = s.nasalised ? 1 : 0

  let kindRank: number
  let codaIdx: number
  if (s.coda === null) {
    kindRank = 0
    codaIdx = 0
  } else {
    const kind = scheme.syllable.coda_kinds[s.coda]
    if (!kind) throw new Error(`rimeSortKey: coda '${s.coda}' has no declared kind in syllable.coda_kinds`)
    kindRank = kind === 'nasal' ? 1 : 2
    codaIdx = 1 + scheme.codas.indexOf(s.coda)
  }

  return [0, nucleusIdx, medialIdx, nasalRank, kindRank, codaIdx]
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Every distinct rime among `syllables` (typically `generateSyllables()`'s
 * output), in the Chart view's declared phonological order. Takes the
 * syllable list as a parameter rather than generating it internally so a
 * caller that already has one (e.g. `buildSyllableChart`, which also needs
 * the legal-tone set per rime) doesn't pay for a second pass.
 */
export function declaredRimeOrder(syllables: Syllable[], scheme: PengimScheme): string[] {
  const representative = new Map<string, Syllable>()
  for (const s of syllables) {
    const rime = rimeOf(s)
    if (!representative.has(rime)) representative.set(rime, s)
  }
  return [...representative.entries()]
    .sort(([, a], [, b]) => compareKeys(rimeSortKey(a, scheme), rimeSortKey(b, scheme)))
    .map(([rime]) => rime)
}
