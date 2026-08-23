import type { PartOfSpeech } from '../schema/entry.js'
import type { WiktextractRecord } from './wiktextract.js'
import { extractAltOf, mapWiktextractTags, mapWiktextractTopics } from './wiktionary-tags.js'

/**
 * Wiktextract's raw `pos` strings, mapped to this dictionary's closed
 * `PART_OF_SPEECH` enum. Deliberately partial: a wiktextract `pos` with no
 * clean equivalent (e.g. `character`, for a bare hanzi with no word-class of
 * its own) is left unmapped rather than guessed — `matchEntrySenses` then
 * can't use it to disambiguate, which is the safe default.
 */
const POS_MAP: Record<string, PartOfSpeech> = {
  noun: 'noun',
  'proper noun': 'proper-noun',
  'proper-noun': 'proper-noun',
  verb: 'verb',
  adj: 'adjective',
  adjective: 'adjective',
  adv: 'adverb',
  adverb: 'adverb',
  pron: 'pronoun',
  pronoun: 'pronoun',
  num: 'numeral',
  numeral: 'numeral',
  classifier: 'classifier',
  prep: 'preposition',
  preposition: 'preposition',
  conj: 'conjunction',
  conjunction: 'conjunction',
  particle: 'particle',
  intj: 'interjection',
  interjection: 'interjection',
  prefix: 'prefix',
  suffix: 'suffix',
  phrase: 'phrase',
  idiom: 'idiom',
}

export interface WiktextractCandidate {
  pos?: PartOfSpeech
  tags: string[]
  topics: string[]
  altOf: string[]
}

/**
 * Every wiktextract sense across a headword and its variant writings,
 * tag-mapped and pos-mapped and ready to match against an entry's own
 * senses — including senses with no tag/topic/alt_of signal of their own.
 *
 * Keeping the untagged senses matters for `matchEntrySenses`'s single-sense
 * shortcut: a headword can have several unrelated senses on one Wiktionary
 * page where only one happens to carry tags — confirmed on 壬, which has
 * four: "ninth heavenly stem" / "crafty" / "a surname", all untagged, plus a
 * tagged "eye dialect spelling of 人". Our own entry for 壬 documents only the
 * first, untagged sense. Returning just the one tagged sense here would make
 * that look like an unambiguous 1-candidate match against the entry's single
 * sense and attach the wrong tags — which is exactly what happened before
 * this was fixed. The total sense count has to include the untagged ones for
 * that shortcut to be safe.
 */
export function buildCandidates(headwords: string[], index: Map<string, WiktextractRecord[]>): WiktextractCandidate[] {
  const candidates: WiktextractCandidate[] = []
  for (const headword of headwords) {
    for (const record of index.get(headword) ?? []) {
      const pos = record.pos ? POS_MAP[record.pos] : undefined
      for (const sense of record.senses ?? []) {
        candidates.push({
          pos,
          tags: mapWiktextractTags(sense.tags),
          topics: mapWiktextractTopics(sense.topics),
          altOf: extractAltOf(sense.alt_of),
        })
      }
    }
  }
  return candidates
}

export interface SenseMatch {
  tags: string[]
  topics: string[]
  altOf: string[]
}

/**
 * Matches an entry's own senses (by index) against wiktextract candidates for
 * the same headword. Deterministic and conservative: attaches only when the
 * match is unambiguous — a single sense on both sides, or a candidate whose
 * `pos` uniquely matches one of the entry's senses — and skips rather than
 * guesses otherwise, since a wrong tag is worse than a missing one.
 */
export function matchEntrySenses(entrySensePos: PartOfSpeech[], candidates: WiktextractCandidate[]): Map<number, SenseMatch> {
  const matches = new Map<number, SenseMatch>()
  if (candidates.length === 0) return matches

  // Only records a match when there's actually something to attach — a
  // candidate can legitimately win the match and still carry no
  // tags/topics/alt_of of its own (e.g. it's counted for cardinality but was
  // filtered to nothing), in which case there's nothing to write for that
  // sense.
  const record = (i: number, c: WiktextractCandidate) => {
    if (c.tags.length > 0 || c.topics.length > 0 || c.altOf.length > 0) {
      matches.set(i, { tags: c.tags, topics: c.topics, altOf: c.altOf })
    }
  }

  if (entrySensePos.length === 1 && candidates.length === 1) {
    record(0, candidates[0]!)
    return matches
  }

  entrySensePos.forEach((pos, i) => {
    const posMatches = candidates.filter((c) => c.pos === pos)
    if (posMatches.length === 1) record(i, posMatches[0]!)
  })

  return matches
}
