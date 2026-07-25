import { tryParsePengim } from '../phonology/syllable.js'
import type { ImportResult, Proposal, ProposedReading } from './types.js'

/**
 * Wiktionary importer — the one open source that actually carries Teochew
 * pronunciations.
 *
 * Teochew readings live in the `{{zh-pron}}` template under the `mn-t`
 * parameter, in Peng'im, e.g.
 *
 *     {{zh-pron
 *     |m=cháozhōu
 *     |mn-t=dio5 ziu1/diê5 ziu1
 *     }}
 *
 * Extraction is regex-based rather than a full wikitext parse. That is a
 * deliberate trade: a complete parser is a large piece of work, and every
 * candidate reading goes through Peng'im validation and then human review
 * before it can reach the dataset, so a mis-extraction is caught rather than
 * silently absorbed.
 */

const API = 'https://en.wiktionary.org/w/api.php'

/** `mn-t=` or `mn_t=`, up to the next `|` or `}}`. */
const MN_T = /\|\s*mn[-_]t\s*=\s*([^|}\n]+)/giu

export function extractTeochewReadings(wikitext: string): string[] {
  const out: string[] = []
  for (const m of wikitext.matchAll(MN_T)) {
    // Strip markup BEFORE splitting: a `</ref>` contains a slash, and splitting
    // first would tear it into two bogus "readings".
    const cleaned = m[1]!
      .replace(/<ref[^>]*>.*?<\/ref>/giu, '') // footnotes, content and all
      .replace(/<[^>]*>/gu, '') // any remaining inline tags
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/gu, '$2') // unwrap wikilinks
      .replace(/'{2,}/gu, '') // wiki bold/italic

    // A single parameter may hold several readings separated by `/` or `,`.
    for (const part of cleaned.split(/[/,]/u)) {
      const reading = part.trim()
      if (reading) out.push(reading)
    }
  }
  return [...new Set(out)]
}

async function fetchWikitext(title: string): Promise<string | null> {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
  }).toString()

  const res = await fetch(url, {
    headers: { 'user-agent': 'teochew-dictionary importer (github; contact via repo)' },
  })
  if (!res.ok) return null
  const body = (await res.json()) as { parse?: { wikitext?: string }; error?: unknown }
  return body.parse?.wikitext ?? null
}

export interface WiktionaryOptions {
  /** Milliseconds between requests. Wiktionary asks clients to be gentle. */
  delayMs?: number
  /** Injectable for tests and for running against a local dump. */
  fetchPage?: (title: string) => Promise<string | null>
}

export async function importWiktionary(
  headwords: string[],
  retrieved: string,
  options: WiktionaryOptions = {},
): Promise<ImportResult> {
  const { delayMs = 200, fetchPage = fetchWikitext } = options

  const proposals: Proposal[] = []
  const misses: string[] = []
  let rejected = 0

  for (const [i, headword] of headwords.entries()) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))

    const wikitext = await fetchPage(headword).catch(() => null)
    if (!wikitext) {
      misses.push(headword)
      continue
    }

    const candidates = extractTeochewReadings(wikitext)
    if (candidates.length === 0) {
      misses.push(headword)
      continue
    }

    // Only well-formed Peng'im survives. Anything else is reported, not merged.
    const readings: ProposedReading[] = []
    const flags: string[] = []
    for (const c of candidates) {
      const parsed = tryParsePengim(c)
      if (parsed.ok) {
        readings.push({ pengim: c, variety: 'chaozhou' })
      } else {
        rejected += 1
        flags.push(`rejected '${c}': ${parsed.error}`)
      }
    }

    if (readings.length === 0) {
      misses.push(headword)
      continue
    }
    if (readings.length > 1) {
      flags.push(`${readings.length} readings found — confirm which are genuine variants`)
    }

    proposals.push({ headword, readings, source: 'wiktionary', retrieved, flags })
  }

  return {
    source: 'wiktionary',
    proposals,
    misses,
    notes: [
      `requested ${headwords.length} headwords, resolved ${proposals.length}`,
      `${rejected} candidate reading(s) rejected as malformed Peng'im`,
      'Wiktionary is CC-BY-SA-4.0 — merging binds the dataset to share-alike',
    ],
  }
}
