import { existsSync } from 'node:fs'

import { importCedict } from '../importers/cedict.js'
import { importWiktionary } from '../importers/wiktionary.js'
import { writeStaging } from '../importers/staging.js'
import { loadEntries } from '../data/load.js'

/**
 * `npm run import -- <source> [args]`
 *
 *   cedict <path/to/cedict_ts.u8>   propose extra English glosses for existing entries
 *   wiktionary [headword...]        fetch Teochew readings (defaults to entries
 *                                   currently flagged needs_review)
 *
 * Both write to data/staging/ for review; neither touches data/entries/.
 */

const USAGE = `usage:
  npm run import -- cedict <path/to/cedict_ts.u8>
  npm run import -- wiktionary [headword...]   (default: entries flagged needs_review)

Both write proposals to data/staging/ for human review. Neither modifies data/entries/.`

// Importers stamp proposals with the date they ran, so provenance stays honest
// when a staged file sits unmerged for a while.
const today = new Date().toISOString().slice(0, 10)

const [source, ...rest] = process.argv.slice(2)

if (!source) {
  console.error(USAGE)
  process.exit(2)
}

switch (source) {
  case 'cedict': {
    const path = rest[0]
    if (!path) {
      console.error('cedict: need a path to cedict_ts.u8\n\n' + USAGE)
      process.exit(2)
    }
    if (!existsSync(path)) {
      console.error(`cedict: no such file: ${path}`)
      console.error('download it from https://www.mdbg.net/chinese/dictionary?page=cc-cedict')
      process.exit(1)
    }
    const result = importCedict(path, today)
    const out = writeStaging(result)
    console.log(`${result.proposals.length} proposal(s) → ${out}`)
    console.log(`${result.misses.length} headword(s) absent from CC-CEDICT`)
    break
  }

  case 'wiktionary': {
    const headwords =
      rest.length > 0
        ? rest
        : loadEntries()
            .filter(({ entry }) => entry.needs_review)
            .map(({ entry }) => entry.headword)

    if (headwords.length === 0) {
      console.log('nothing to fetch: no headwords given and no entries flagged needs_review')
      process.exit(0)
    }

    console.log(`fetching ${headwords.length} headword(s) from Wiktionary…`)
    const result = await importWiktionary(headwords, today)
    const out = writeStaging(result)
    console.log(`${result.proposals.length} proposal(s) → ${out}`)
    for (const n of result.notes) console.log(`  ${n}`)
    if (result.misses.length > 0) {
      console.log(`  no Teochew reading found for: ${result.misses.join(', ')}`)
    }
    break
  }

  default:
    console.error(`unknown import source '${source}'\n\n${USAGE}`)
    process.exit(2)
}
