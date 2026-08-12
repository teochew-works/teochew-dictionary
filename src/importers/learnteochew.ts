import { mkdirSync, writeFileSync } from 'node:fs'
import { stringify } from 'yaml'

import { EXTERNAL_DIR, LEARNTEOCHEW_CHART_FILE } from '../paths.js'
import { IMPORTER_USER_AGENT } from './types.js'

/**
 * Learn Teochew (learnteochew.com) pronunciation-page importer — the source
 * behind the syllable inventory's external cross-check (issue #30).
 *
 * The page's Consonants, Finals and Tones tables each carry an explicit
 * "Peng'im" column (a direct notation match to this dataset's own scheme),
 * which is what gets extracted. Its Vowels table is a strict subset of the
 * Finals table (every simple vowel reappears there), so it is not extracted
 * separately. Extraction is regex-based rather than a full HTML parse — the
 * same house-style trade `importers/wiktionary.ts` makes: a full parser is a
 * large piece of work for one narrow, occasionally-rerun use, and the output
 * only ever feeds an advisory cross-check, never the dataset directly.
 */

const URL = 'https://learnteochew.com/pages/pronunciation.html'

export interface ParsedChart {
  initials: string[]
  finals: string[]
  tones: string[]
}

interface ParsedTable {
  header: string[]
  rows: string[][]
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/gu, '')
    .replace(/&#8217;|&rsquo;|’/gu, "'")
    .replace(/&amp;/gu, '&')
    .trim()
}

function parseTable(tableHtml: string): ParsedTable {
  const rowsHtml = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gu)].map((m) => m[1]!)
  const cellsOf = (row: string): string[] =>
    [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gu)].map((m) => stripTags(m[1]!))
  const [headerRow, ...dataRows] = rowsHtml
  return { header: headerRow ? cellsOf(headerRow) : [], rows: dataRows.map(cellsOf) }
}

function pengimColumn(t: ParsedTable): number {
  return t.header.findIndex((h) => /^peng.?im$/iu.test(h.replace(/['’]/gu, '')))
}

/** A cell may hold several alternate spellings, e.g. "iê, io" — split them out. */
function cellsFor(t: ParsedTable): string[] {
  const col = pengimColumn(t)
  return t.rows.flatMap((r) =>
    (r[col] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  )
}

export function parsePronunciationHtml(html: string): ParsedChart {
  const blocks = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gu)].map((m) => m[1]!)
  const withPengim = blocks.map(parseTable).filter((t) => pengimColumn(t) >= 0)

  const tonesTable = withPengim.find((t) => /^name$/iu.test(t.header[0] ?? ''))
  const rest = withPengim.filter((t) => t !== tonesTable)
  const finalsTable =
    rest.length > 0 ? rest.reduce((max, t) => (t.rows.length > max.rows.length ? t : max)) : undefined

  // The Consonants table is identified positively, not by table order: its
  // Peng'im values are never a subset of Finals's. The Vowels table's are
  // (every simple vowel reappears in Finals, per the module doc comment
  // above), which is what rules it out here instead of relying on it always
  // being smaller than, or ordered a particular way relative to, Consonants.
  const finalsCells = new Set(finalsTable ? cellsFor(finalsTable) : [])
  const initialsCandidates = rest.filter((t) => {
    if (t === finalsTable) return false
    const cells = cellsFor(t)
    return cells.length > 0 && !cells.every((c) => finalsCells.has(c))
  })
  const initialsTable = initialsCandidates.length === 1 ? initialsCandidates[0] : undefined

  if (!initialsTable || !finalsTable || !tonesTable) {
    throw new Error(
      "learnteochew pronunciation page structure has changed — expected exactly one Consonants table (distinct from Finals/Vowels) plus Finals and Tones tables, each with a Peng'im column",
    )
  }

  const initials = cellsFor(initialsTable)
  const finals = cellsFor(finalsTable)
  const tones = cellsFor(tonesTable)

  if (initials.length === 0 || finals.length === 0 || tones.length === 0) {
    throw new Error('learnteochew pronunciation page: one or more tables parsed empty')
  }

  return { initials, finals, tones }
}

export interface LearnteochewChart extends ParsedChart {
  source: 'learnteochew'
  retrieved: string
}

async function fetchHtmlDefault(): Promise<string> {
  const res = await fetch(URL, {
    headers: { 'user-agent': IMPORTER_USER_AGENT },
  })
  if (!res.ok) throw new Error(`learnteochew: HTTP ${res.status} fetching ${URL}`)
  return res.text()
}

export interface FetchOptions {
  /** Injectable for tests and offline runs. */
  fetchHtml?: () => Promise<string>
}

export async function fetchLearnteochewChart(
  retrieved: string,
  options: FetchOptions = {},
): Promise<LearnteochewChart> {
  const { fetchHtml = fetchHtmlDefault } = options
  const html = await fetchHtml()
  return { source: 'learnteochew', retrieved, ...parsePronunciationHtml(html) }
}

/** Writes data/phonology/external/learnteochew.yaml, returns the path. */
export function writeLearnteochewChart(chart: LearnteochewChart): string {
  mkdirSync(EXTERNAL_DIR, { recursive: true })

  const header = [
    `# Cached snapshot of the Peng'im columns of ${URL}'s`,
    '# Consonants, Finals and Tones tables. Backs the syllable-inventory',
    '# cross-check (src/phonology/inventory.ts). Read by `npm run check`, but',
    '# never fetched live during it — network access stays confined to `xref`.',
    '#',
    "# Regenerate with `npm run xref -- learnteochew`, then bump this source's",
    "# `retrieved:` date in data/sources.yaml by hand.",
    '',
  ].join('\n')

  writeFileSync(LEARNTEOCHEW_CHART_FILE, header + stringify(chart))
  return LEARNTEOCHEW_CHART_FILE
}
