import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

import { DIST_DIR } from '../paths.js'
import { loadEntries, loadSources } from '../data/load.js'
import { listVarieties, loadVariety } from '../phonology/load.js'
import { emitAllSchemas } from '../schema/emit.js'
import { createEnricher, stripDiacritics, type EnrichedEntry } from './enrich.js'
import { buildSounds } from './sounds.js'
import { buildSyllableChart } from './syllable-chart.js'
import { buildStarterDecks } from './starter-decks.js'

/**
 * Build the distributable artifacts from the YAML source of truth.
 *
 * Six outputs, for six consumers:
 *   dict.json           — the whole dataset, for anything that can hold it in memory
 *   dict.ndjson         — one entry per line, for streaming and for diff-friendly review
 *   dict.sqlite         — indexed, with FTS5, for a real lookup path
 *   sounds.json         — every attested syllable + example words, for the web UI's Sounds tab
 *   syllable-chart.json — per-(initial,rime) legal/attested/recorded/staged tone sets,
 *                         for the Sounds tab's Chart view (issue #171, staged tier issue #183)
 *   starter-decks.json  — the curated marketplace catalog of themed beginner decks,
 *                         for the web UI's flashcards Marketplace pane (issue #199)
 */

export interface BuildResult {
  entries: number
  readings: number
  outputs: string[]
}

export function build(): BuildResult {
  const loaded = loadEntries()
  const { enrich } = createEnricher()
  const enriched = loaded
    .map(({ entry }) => enrich(entry))
    .sort((a, b) => a.id.localeCompare(b.id))

  rmSync(DIST_DIR, { recursive: true, force: true })
  mkdirSync(DIST_DIR, { recursive: true })

  const outputs: string[] = []
  const emit = (name: string, contents: string) => {
    writeFileSync(join(DIST_DIR, name), contents)
    outputs.push(name)
  }

  const meta = {
    generated_from: 'data/',
    entry_count: enriched.length,
    reading_count: enriched.reduce((n, e) => n + e.readings.length, 0),
    varieties: listVarieties().map((id) => {
      const v = loadVariety(id)
      return { id, name: v.variety.name, inherits: v.variety.inherits ?? null }
    }),
    sources: loadSources(),
  }

  emit('dict.json', JSON.stringify({ meta, entries: enriched }, null, 2))
  emit('dict.ndjson', enriched.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const soundsData = buildSounds(loaded)
  emit('sounds.json', JSON.stringify(soundsData, null, 2))
  emit('syllable-chart.json', JSON.stringify(buildSyllableChart(soundsData.sounds), null, 2))

  const starterDecks = buildStarterDecks(loaded)
  emit('starter-decks.json', JSON.stringify({ decks: starterDecks.decks }, null, 2))
  if (starterDecks.unresolved.length > 0) {
    console.warn(`starter-decks: ${starterDecks.unresolved.length} headword(s) unresolved:`)
    for (const { deckId, headword } of starterDecks.unresolved) console.warn(`  ${deckId}: ${headword}`)
  }

  emitAllSchemas(emit)

  buildSqlite(join(DIST_DIR, 'dict.sqlite'), enriched)
  outputs.push('dict.sqlite')

  return { entries: enriched.length, readings: meta.reading_count, outputs }
}

function buildSqlite(path: string, entries: EnrichedEntry[]): void {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE entries (
      id           TEXT PRIMARY KEY,
      headword     TEXT NOT NULL,
      frequency    INTEGER,
      needs_review INTEGER NOT NULL DEFAULT 0,
      tags         TEXT,
      sources      TEXT NOT NULL,
      licence      TEXT NOT NULL,
      attributions TEXT,
      json         TEXT NOT NULL
    );

    CREATE TABLE readings (
      entry_id        TEXT NOT NULL REFERENCES entries(id),
      idx             INTEGER NOT NULL,
      pengim          TEXT NOT NULL,
      pengim_toneless TEXT NOT NULL,
      variety         TEXT NOT NULL,
      register        TEXT,
      ipa             TEXT NOT NULL,
      poj             TEXT NOT NULL,
      poj_plain       TEXT NOT NULL,
      sandhi          TEXT NOT NULL,
      ipa_confidence  TEXT NOT NULL,
      PRIMARY KEY (entry_id, idx)
    );

    CREATE TABLE senses (
      entry_id TEXT NOT NULL REFERENCES entries(id),
      idx      INTEGER NOT NULL,
      pos      TEXT NOT NULL,
      gloss_en TEXT NOT NULL,
      gloss_zh TEXT,
      PRIMARY KEY (entry_id, idx)
    );

    CREATE INDEX readings_pengim      ON readings(pengim);
    CREATE INDEX readings_toneless    ON readings(pengim_toneless);
    CREATE INDEX readings_poj_plain   ON readings(poj_plain);
    CREATE INDEX entries_headword     ON entries(headword);

    -- One FTS row per entry, holding every string a user might type. Unicode61
    -- with no diacritic folding, since we index pre-folded forms ourselves.
    CREATE VIRTUAL TABLE search USING fts5(
      id UNINDEXED,
      headword,
      pengim,
      gloss,
      tokenize = 'unicode61'
    );
  `)

  const insEntry = db.prepare(
    `INSERT INTO entries (id, headword, frequency, needs_review, tags, sources, licence, attributions, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insReading = db.prepare(
    `INSERT INTO readings
       (entry_id, idx, pengim, pengim_toneless, variety, register, ipa, poj, poj_plain, sandhi, ipa_confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insSense = db.prepare(
    `INSERT INTO senses (entry_id, idx, pos, gloss_en, gloss_zh) VALUES (?, ?, ?, ?, ?)`,
  )
  const insSearch = db.prepare(
    `INSERT INTO search (id, headword, pengim, gloss) VALUES (?, ?, ?, ?)`,
  )

  const insertAll = db.transaction((rows: EnrichedEntry[]) => {
    for (const e of rows) {
      insEntry.run(
        e.id,
        e.headword,
        e.frequency ?? null,
        e.needs_review ? 1 : 0,
        e.tags?.join(' ') ?? null,
        e.sources.join(' '),
        e.licence,
        e.attributions.length > 0 ? e.attributions.join('; ') : null,
        JSON.stringify(e),
      )

      e.readings.forEach((r, i) => {
        insReading.run(
          e.id,
          i,
          r.pengim,
          r.pengim_toneless,
          r.variety,
          r.register ?? null,
          r.ipa,
          r.poj,
          stripDiacritics(r.poj),
          r.sandhi,
          r.ipa_confidence,
        )
      })

      e.senses.forEach((s, i) => {
        insSense.run(e.id, i, s.pos, s.gloss_en.join('; '), s.gloss_zh?.join('; ') ?? null)
      })

      insSearch.run(
        e.id,
        [e.headword, ...(e.variants ?? [])].join(' '),
        e.readings
          .flatMap((r) => [r.pengim, r.pengim_toneless, r.poj, stripDiacritics(r.poj)])
          .join(' '),
        e.senses.flatMap((s) => [...s.gloss_en, ...(s.gloss_zh ?? [])]).join(' '),
      )
    }
  })

  insertAll(entries)
  db.exec('VACUUM')
  db.close()
}
