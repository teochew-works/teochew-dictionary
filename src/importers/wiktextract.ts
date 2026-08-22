import { readFileSync } from 'node:fs'

import { WIKTEXTRACT_MIN_FILE } from '../paths.js'

export interface WiktextractAltOf {
  word: string
  extra?: string
}

export interface WiktextractSense {
  glosses?: string[]
  tags?: string[]
  raw_tags?: string[]
  topics?: string[]
  qualifier?: string
  alt_of?: WiktextractAltOf[]
}

export interface WiktextractRecord {
  word: string
  pos?: string
  senses?: WiktextractSense[]
  teochew_sound?: { zh_pron?: string; ipa?: string; tags?: string[] }[]
  flags?: string[]
}

/**
 * Indexes the trimmed wiktextract dump (issue #84) by headword. A word can
 * carry more than one record — one per POS/etymology section on its
 * Wiktionary page, e.g. 本土's separate `noun` and `adj` sections — so a
 * lookup returns every record for that headword, not just the first.
 *
 * `.cache/` is a gitignored, operator-populated cache (see README): a
 * missing file returns an empty index rather than throwing, so a caller using
 * this purely for optional tag enrichment degrades gracefully instead of
 * failing.
 */
export function loadWiktextractIndex(path: string = WIKTEXTRACT_MIN_FILE): Map<string, WiktextractRecord[]> {
  const index = new Map<string, WiktextractRecord[]>()

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return index
  }

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const record = JSON.parse(line) as WiktextractRecord
    const existing = index.get(record.word)
    if (existing) existing.push(record)
    else index.set(record.word, [record])
  }

  return index
}

/** Every sense across every record wiktextract has for a headword. */
export function sensesFor(headword: string, index: Map<string, WiktextractRecord[]>): WiktextractSense[] {
  return (index.get(headword) ?? []).flatMap((record) => record.senses ?? [])
}
