import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'

import { DATA_DIR } from '../paths.js'
import type { ImportResult } from './types.js'

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
    '# remembering to add the source id to the entry\'s `sources` list.',
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
