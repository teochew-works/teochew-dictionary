import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

import { DIST_DIR } from '../paths.js'
import { stripDiacritics, stripTones } from '../build/enrich.js'
import type { EnrichedEntry } from '../build/enrich.js'

/**
 * Lookup against the built SQLite artifact.
 *
 * Matching runs in tiers — exact headword, then exact romanisation (in any of
 * its spellings), then full-text — and stops at the first tier that produces
 * hits. Mixing tiers would bury an exact hit under fuzzy ones.
 */

export type MatchKind = 'headword' | 'romanisation' | 'fulltext'

export interface Hit {
  entry: EnrichedEntry
  match: MatchKind
}

export const DB_PATH = join(DIST_DIR, 'dict.sqlite')

export class NotBuiltError extends Error {
  constructor() {
    super(`no dictionary at ${DB_PATH} — run \`npm run build\` first`)
    this.name = 'NotBuiltError'
  }
}

export function openDb(path = DB_PATH): Database.Database {
  if (!existsSync(path)) throw new NotBuiltError()
  return new Database(path, { readonly: true })
}

/** FTS5 treats bare punctuation as syntax; quote the term to search literally. */
function ftsQuote(query: string): string {
  return `"${query.replace(/"/gu, '""')}"`
}

export function lookup(query: string, db: Database.Database, limit = 20): Hit[] {
  const q = query.trim()
  if (!q) return []

  const rows = (sql: string, ...params: unknown[]) =>
    db.prepare(sql).all(...params) as { json: string }[]

  const byHeadword = rows(
    `SELECT json FROM entries
     WHERE headword = ?
     ORDER BY COALESCE(frequency, 0) DESC, id
     LIMIT ?`,
    q,
    limit,
  )
  if (byHeadword.length > 0) return decorate(byHeadword, 'headword')

  // Accept any spelling of the romanisation: with tones, without, POJ with or
  // without diacritics, and with or without syllable separators. Anonymous
  // placeholders throughout — better-sqlite3 will not bind ?N-style parameters
  // positionally, so repeated values are simply passed again.
  const toneless = stripTones(q).trim()
  const plain = stripDiacritics(q)
  const squashed = toneless.replace(/\s+/gu, '')
  const byRomanisation = rows(
    `SELECT e.json, e.id, COALESCE(e.frequency, 0) AS freq FROM entries e
     JOIN readings r ON r.entry_id = e.id
     WHERE r.pengim = ?
        OR r.pengim_toneless = ?
        OR REPLACE(r.pengim_toneless, ' ', '') = ?
        OR r.poj = ?
        OR r.poj_plain = ?
        OR REPLACE(r.poj_plain, '-', '') = ?
     GROUP BY e.id
     ORDER BY freq DESC, e.id
     LIMIT ?`,
    q,
    toneless,
    squashed,
    q,
    plain,
    plain.replace(/-/gu, ''),
    limit,
  )
  if (byRomanisation.length > 0) return decorate(byRomanisation, 'romanisation')

  const byText = rows(
    `SELECT e.json FROM search s
     JOIN entries e ON e.id = s.id
     WHERE s.search MATCH ?
     ORDER BY s.rank, COALESCE(e.frequency, 0) DESC
     LIMIT ?`,
    ftsQuote(q),
    limit,
  )
  return decorate(byText, 'fulltext')
}

function decorate(rows: { json: string }[], match: MatchKind): Hit[] {
  return rows.map((r) => ({ entry: JSON.parse(r.json) as EnrichedEntry, match }))
}
