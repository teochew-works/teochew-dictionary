import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { STAGING_DIR } from './staging.js'
import type { AudioClipProposal, AudioImportResult } from './audio-types.js'

/**
 * Writes an audio-clip import result to `data/staging/<source>.yaml` — same
 * location/filename convention `writeStaging` (./staging.js) uses for entry
 * proposals, but a different internal shape: these are proposed CLIPS
 * (pengim/url/speaker/accentNote), not entries. Kept as a parallel writer
 * rather than folding into `writeStaging`, whose `Proposal` type is
 * headword/readings/senses-shaped and has no room for a clip's fields.
 */
export function writeAudioStaging(result: AudioImportResult): string {
  mkdirSync(STAGING_DIR, { recursive: true })
  const path = join(STAGING_DIR, `${result.source}.yaml`)

  const header = [
    `# Audio clip import proposals from '${result.source}' — NOT part of the dataset.`,
    '#',
    "# Unlike data/staging/wiktionary.yaml, these are proposed AUDIO CLIPS, not",
    '# entries: review each one\'s pengim/hanzi/accentNote, judge which variety',
    "# it's actually an example of, then run `npm run merge:lingualibre -- <index",
    '# -or-commonsTitle> --variety=<id>` — re-hosts the bytes and writes the clip',
    '# straight into data/phonology/audio/<variety>.yaml (under `clips` if',
    '# syllableCount is 1, `wordClips` if 2 or more; REVIEW.md § 16). A direct hand',
    '# edit of that file works too if you prefer.',
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

/** Reads back what a previous `writeAudioStaging` call wrote. */
export function readAudioStaging(source: string): { proposals: AudioClipProposal[]; misses: string[] } | null {
  const path = join(STAGING_DIR, `${source}.yaml`)
  if (!existsSync(path)) return null

  const raw = parseYaml(readFileSync(path, 'utf8')) as {
    proposals?: AudioClipProposal[]
    misses?: string[]
  }
  return { proposals: raw.proposals ?? [], misses: raw.misses ?? [] }
}
