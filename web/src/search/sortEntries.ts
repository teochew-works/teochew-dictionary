import type { EnrichedEntry, Level, PartOfSpeech } from '../types/dict'
import { DEFAULT_PRONUNCIATION_MODE, type PronunciationMode } from '../settings/pronunciationMode'

export type SortMode = 'relevance' | 'headword' | 'english' | 'tone' | 'category' | 'level'

/**
 * The modes that render a grouped tree rather than a flat list. Kept as a
 * predicate — and its own type, matching `groupEntries`'s own `mode`
 * parameter below — so a caller and `groupEntries` can't drift apart on which
 * modes are "grouped" (see DictionaryView.tsx's `isFlat`/`sortedEntries`/
 * `groups`).
 */
export type GroupedSortMode = 'tone' | 'category' | 'level'

export function isGrouped(mode: SortMode): mode is GroupedSortMode {
  return mode === 'tone' || mode === 'category' || mode === 'level'
}

export const LEVEL_ORDER: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export interface EntryGroup {
  key: string
  label: string
  entries: EnrichedEntry[]
}

const POS_LABELS: Record<PartOfSpeech, string> = {
  noun: 'Noun',
  'proper-noun': 'Proper noun',
  verb: 'Verb',
  adjective: 'Adjective',
  adverb: 'Adverb',
  pronoun: 'Pronoun',
  numeral: 'Numeral',
  classifier: 'Classifier',
  preposition: 'Preposition',
  conjunction: 'Conjunction',
  particle: 'Particle',
  interjection: 'Interjection',
  prefix: 'Prefix',
  suffix: 'Suffix',
  phrase: 'Phrase',
  idiom: 'Idiom',
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/**
 * Tone digit (1-8) of a Peng'im/sandhi string's first syllable, e.g.
 * "dio5 ziu1" -> 5. Every syllable is schema-guaranteed to end in 1-8 (see
 * entrySchema in src/schema/entry.ts), but this returns null defensively
 * rather than throwing if that's ever untrue.
 */
export function firstSyllableTone(pengim: string): number | null {
  const firstSyllable = pengim.trim().split(/\s+/u)[0]
  if (!firstSyllable) return null
  const toneChar = firstSyllable.at(-1)
  if (!toneChar || !/[1-8]/u.test(toneChar)) return null
  return Number(toneChar)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Sorts a flat copy of `entries` by headword or first English gloss.
 *
 * `relevance` is the pass-through mode: it returns `entries` in the order it
 * was handed them, which for a search is Fuse's score order. Re-sorting a
 * result set by headword throws that ranking away — searching "wood" used to
 * bury 木材/木 around position 150 of a few hundred alphabetised matches.
 */
export function sortFlat(entries: EnrichedEntry[], mode: 'relevance' | 'headword' | 'english'): EnrichedEntry[] {
  if (mode === 'relevance') return [...entries]
  const keyFor = mode === 'headword' ? (e: EnrichedEntry) => e.headword : (e: EnrichedEntry) => e.senses[0]?.gloss_en[0] ?? ''
  return [...entries].sort((a, b) => collator.compare(keyFor(a), keyFor(b)))
}

function toneGroupKey(entry: EnrichedEntry, pronunciation: PronunciationMode): { key: string; label: string } {
  const reading = entry.readings[0]
  const pengim = reading ? (pronunciation === 'citation' ? reading.pengim : reading.sandhi) : undefined
  const tone = pengim ? firstSyllableTone(pengim) : null
  return tone === null ? { key: 'other', label: 'Other' } : { key: String(tone), label: `Tone ${tone}` }
}

function categoryGroupKey(entry: EnrichedEntry): { key: string; label: string } {
  const tag = entry.tags?.[0]
  if (tag) return { key: `tag:${tag}`, label: capitalize(tag) }
  const pos = entry.senses[0]?.pos
  if (pos) return { key: `pos:${pos}`, label: POS_LABELS[pos] }
  return { key: 'other', label: 'Other' }
}

function levelGroupKey(entry: EnrichedEntry): { key: string; label: string } {
  const level = entry.level
  return level ? { key: level, label: level } : { key: 'untiered', label: 'Untiered' }
}

/**
 * Groups `entries` by tone (citation or sandhi tone digit of the first
 * reading's first syllable), category (first tag, falling back to part of
 * speech when the entry has no tags), or CEFR level. Tone groups sort
 * numerically 1-8 with any unparseable-tone "Other" group last; level groups
 * sort A1-C2 with an untiered-entry "Untiered" group last; category groups
 * sort alphabetically by label.
 */
export function groupEntries(
  entries: EnrichedEntry[],
  mode: GroupedSortMode,
  pronunciation: PronunciationMode = DEFAULT_PRONUNCIATION_MODE,
): EntryGroup[] {
  const groups = new Map<string, EntryGroup>()

  for (const entry of entries) {
    const { key, label } =
      mode === 'tone' ? toneGroupKey(entry, pronunciation) : mode === 'category' ? categoryGroupKey(entry) : levelGroupKey(entry)
    let group = groups.get(key)
    if (!group) {
      group = { key, label, entries: [] }
      groups.set(key, group)
    }
    group.entries.push(entry)
  }

  const result = [...groups.values()]
  if (mode === 'tone') {
    result.sort((a, b) => (a.key === 'other' ? 9 : Number(a.key)) - (b.key === 'other' ? 9 : Number(b.key)))
  } else if (mode === 'level') {
    const rank = (key: string) => (key === 'untiered' ? LEVEL_ORDER.length : LEVEL_ORDER.indexOf(key as Level))
    result.sort((a, b) => rank(a.key) - rank(b.key))
  } else {
    result.sort((a, b) => collator.compare(a.label, b.label))
  }
  return result
}
