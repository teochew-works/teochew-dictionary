import { loadSandhi } from './load.js'
import { formatSyllable, parsePengim, type Syllable } from './syllable.js'
import type { SandhiTable } from '../schema/phonology.js'

/**
 * Tone sandhi 變調.
 *
 * In a Teochew tone group every syllable except the last surfaces with a changed
 * tone; the final syllable keeps its citation tone. Because the citation tone
 * survives in final position it is what the dictionary stores — sandhi is
 * derived, never hand-entered.
 *
 * The rule table itself lives in data/phonology/sandhi/*.yaml and is flagged
 * `needs_review`: reported values differ between descriptions and between
 * speakers, so it is deliberately one file edit away from being corrected.
 *
 * Scope limitation: this treats a headword as a single tone group, which is
 * right for compounds but does not model phrase-level regrouping, where the
 * domain boundaries depend on syntax.
 */

export interface SandhiSyllable {
  /** Peng'im with the citation tone, as stored. */
  citation: string
  /** Peng'im respelled with the surface tone number. */
  surface: string
  citationTone: number
  surfaceTone: number
  /** Chao contour of the surface realisation. */
  contour: string
  /** False for the final syllable of the group, which does not undergo sandhi. */
  changed: boolean
}

export interface SandhiResult {
  syllables: SandhiSyllable[]
  /** Peng'im for the whole word with surface tones applied. */
  surface: string
  needsReview: boolean
}

function applyToSyllable(
  s: Syllable,
  isFinal: boolean,
  table: SandhiTable,
): SandhiSyllable {
  const citation = formatSyllable(s)

  if (isFinal) {
    return {
      citation,
      surface: citation,
      citationTone: s.tone,
      surfaceTone: s.tone,
      contour: table.rules[String(s.tone)]?.contour ?? '',
      changed: false,
    }
  }

  const rule = table.rules[String(s.tone)]
  if (!rule) throw new Error(`sandhi table '${table.sandhi.id}' has no rule for tone ${s.tone}`)

  const surface = formatSyllable({ ...s, tone: rule.to })
  return {
    citation,
    surface,
    citationTone: s.tone,
    surfaceTone: rule.to,
    contour: rule.contour,
    changed: rule.to !== s.tone,
  }
}

/** Apply tone sandhi across a Peng'im word, treating it as one tone group. */
export function applySandhi(pengim: string, sandhiId = 'chaozhou'): SandhiResult {
  const table = loadSandhi(sandhiId)
  const parsed = parsePengim(pengim)
  const last = parsed.length - 1
  const syllables = parsed.map((s, i) => applyToSyllable(s, i === last, table))
  return {
    syllables,
    surface: syllables.map((s) => s.surface).join(' '),
    needsReview: table.sandhi.needs_review ?? false,
  }
}

/** Apply sandhi to already-parsed syllables, reusing a loaded table. */
export function applySandhiToSyllables(
  syllables: Syllable[],
  table: SandhiTable,
): SandhiResult {
  const last = syllables.length - 1
  const out = syllables.map((s, i) => applyToSyllable(s, i === last, table))
  return {
    syllables: out,
    surface: out.map((s) => s.surface).join(' '),
    needsReview: table.sandhi.needs_review ?? false,
  }
}

/**
 * A per-variety sandhi table lookup with fallback to the `chaozhou`
 * reference table for varieties that don't have their own, cached so a
 * variety's table (or its fallback) is only loaded once per resolver.
 */
export function createSandhiResolver(): (varietyId: string) => SandhiTable {
  const cache = new Map<string, SandhiTable>()
  return (varietyId: string) => {
    let t = cache.get(varietyId)
    if (t) return t
    try {
      t = loadSandhi(varietyId)
    } catch {
      t = cache.get('chaozhou') ?? loadSandhi('chaozhou')
    }
    cache.set(varietyId, t)
    return t
  }
}
