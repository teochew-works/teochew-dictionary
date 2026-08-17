import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { DATA_DIR } from '../paths.js'
import type { ImportResult, Proposal } from './types.js'

export const STAGING_DIR = join(DATA_DIR, 'staging')

/**
 * Write an import result to `data/staging/<source>.yaml` for human review.
 *
 * The file is intentionally NOT in entry-file format: it will not validate as a
 * lexicon file and cannot be dropped into `data/entries/` unedited. Merging is a
 * deliberate act.
 */
export function writeStaging(result: ImportResult): string {
  mkdirSync(STAGING_DIR, { recursive: true })
  const path = join(STAGING_DIR, `${result.source}.yaml`)

  const header = [
    `# Import proposals from '${result.source}' — NOT part of the dataset.`,
    '#',
    '# Review each proposal, then hand-merge the good ones into data/entries/*.yaml,',
    '# remembering to add the source id to the entry\'s `sources` list and to',
    '# carry its `retrieved` date across.',
    '#',
    ...result.notes.map((n) => `# ${n}`),
    '',
  ].join('\n')

  writeFileSync(
    path,
    header +
      stringify({
        source: result.source,
        proposal_count: result.proposals.length,
        misses: result.misses,
        proposals: result.proposals,
      }),
  )

  return path
}

/** Reads back what a previous `writeStaging` call wrote, for merging in a chunked run. */
export function readStaging(source: string): { proposals: Proposal[]; misses: string[] } | null {
  const path = join(STAGING_DIR, `${source}.yaml`)
  if (!existsSync(path)) return null

  const raw = parseYaml(readFileSync(path, 'utf8')) as {
    proposals?: Proposal[]
    misses?: string[]
  }
  return { proposals: raw.proposals ?? [], misses: raw.misses ?? [] }
}

/**
 * Combines a prior staging snapshot with a new batch's results, for runs too
 * large to fetch in one `writeStaging` call without risking losing an earlier
 * batch's work to a later one's overwrite (issue #54).
 *
 * A headword resolved in `incoming` replaces any earlier proposal for the same
 * headword and is dropped from `misses`, even if it was previously a miss.
 */
export function mergeImportResults(
  previous: { proposals: Proposal[]; misses: string[] },
  incoming: ImportResult,
): ImportResult {
  const proposalsByHeadword = new Map(previous.proposals.map((p) => [p.headword, p]))
  for (const p of incoming.proposals) proposalsByHeadword.set(p.headword, p)

  const proposals = [...proposalsByHeadword.values()]
  const misses = [...new Set([...previous.misses, ...incoming.misses])].filter(
    (h) => !proposalsByHeadword.has(h),
  )

  return {
    source: incoming.source,
    proposals,
    misses,
    notes: [
      `cumulative: ${proposals.length + misses.length} headword(s) tracked, ${proposals.length} resolved`,
      ...incoming.notes,
    ],
  }
}
