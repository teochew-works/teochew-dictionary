import type { WiktextractAltOf } from './wiktextract.js'

/**
 * Wiktextract's `senses[].tags` is a flat, multi-membership label list mixing
 * genuine usage/register information (`dialectal`, `figuratively`,
 * `obsolete`, ...) with tags that describe *scope* rather than usage: this
 * dictionary's own reading systems (`Teochew`, `Min-Nan`, `Peng'im`, `POJ`,
 * `Sinological-IPA`), other Chinese topolects a pan-Chinese Wiktionary sense
 * applies to (`Cantonese`, `Sichuanese`, `Wu`, ...), and — the long tail that
 * makes a denylist unworkable — individual Chinese place/county names, one
 * per sense that happens to be scoped to somewhere: a single backfill run
 * against ~16k headwords surfaced over 130 of them (`Guiyang`, `Chengdu`,
 * `Jinan`, `Zhuhai`, ...), a set that can never be fully enumerated.
 *
 * What separates the two groups reliably in practice, across that whole run:
 * every genuine usage/register/grammatical tag was lowercase
 * (`literary`, `verb-object`, `alt-of`, ...); every place/topolect/language/
 * script-variant tag was capitalized (`Teochew`, `Hong-Kong`,
 * `Zhangzhou-Hokkien`, ...). So capitalization is the primary filter, with a
 * short list of exceptions in each direction for the handful of cases that
 * don't follow it. `senses[].tags` in our own schema is open-ended (issue
 * #102), so this filtering happens at import/backfill time, not in the
 * schema.
 *
 * Not exhaustive by design: extend the exception sets as review of real data
 * turns up more, per issue #102's acceptance criteria.
 */
const KEEP_DESPITE_CAPITAL = new Set([
  'Classical', // Classical Chinese register — a usage label, not a place.
  'Classical-Chinese',
  'Ancient',
  'Internet', // domain/register, e.g. "Internet slang" — not a place.
  'TV',
])
const DROP_DESPITE_LOWERCASE = new Set([
  'traditional', // Chinese script-form marker (paired with capitalized `Simplified`), not usage register.
  'error-lua-timeout', // wiktextract template-execution failure, not a real usage tag.
  'error-unknown-tag',
  'empty-gloss', // wiktextract extraction diagnostic; `no-gloss` (kept) is the one README documents as worth surfacing.
])

/** Filters wiktextract's raw sense tags down to genuine usage/register signal, trimmed and deduped. */
export function mapWiktextractTags(rawTags: string[] | undefined): string[] {
  if (!rawTags) return []
  const kept: string[] = []
  for (const raw of rawTags) {
    const tag = raw.trim()
    if (!tag || kept.includes(tag)) continue

    // \p{Lu}, not [A-Z]: a bare [A-Z] check missed 'Ürümqi' in a real backfill run.
    const looksLikeProperNoun = /^\p{Lu}/u.test(tag)
    if (looksLikeProperNoun ? !KEEP_DESPITE_CAPITAL.has(tag) : DROP_DESPITE_LOWERCASE.has(tag)) continue

    kept.push(tag)
  }
  return kept
}

/** Pulls the target headword(s) out of wiktextract's structured `alt_of`, dropping the Mandarin gloss `extra` carries. */
export function extractAltOf(rawAltOf: WiktextractAltOf[] | undefined): string[] {
  if (!rawAltOf) return []
  const words: string[] = []
  for (const { word } of rawAltOf) {
    if (word && !words.includes(word)) words.push(word)
  }
  return words
}
