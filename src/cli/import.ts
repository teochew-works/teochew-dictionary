import { existsSync } from 'node:fs'

import { importCedict } from '../importers/cedict.js'
import { backfillStagedTags, importWiktionary } from '../importers/wiktionary.js'
import { mergeImportResults, readStaging, writeStaging } from '../importers/staging.js'
import { loadEntries } from '../data/load.js'
import { loadWiktionaryWordlist, writeWiktionaryWordlist } from '../data/wiktionary-wordlist.js'

/**
 * `npm run import -- <source> [args]`
 *
 *   cedict <path/to/cedict_ts.u8>   propose extra English glosses for existing entries
 *   wiktionary [headword...]        fetch Teochew readings (defaults to entries
 *                                   currently flagged needs_review)
 *   wiktionary --from-wordlist [--limit=N] [--delay=MS]
 *                                   fetch the to_fetch items in
 *                                   data/wordlists/wiktionary-teochew-index.yaml
 *                                   (issue #54); merges into staging and flips
 *                                   each processed headword's status instead of
 *                                   overwriting, so repeated chunked runs are
 *                                   resumable.
 *   wiktionary --backfill-tags      re-derive tags/alt_of for every proposal
 *                                   already in data/staging/wiktionary.yaml
 *                                   from the local wiktextract cache (issue
 *                                   #102) — no live fetch, no headwords needed.
 *
 * Both write to data/staging/ for review; neither touches data/entries/.
 */

const USAGE = `usage:
  npm run import -- cedict <path/to/cedict_ts.u8>
  npm run import -- wiktionary [headword...]   (default: entries flagged needs_review)
  npm run import -- wiktionary --from-wordlist [--limit=N] [--delay=MS]
                                                (to_fetch items from
                                                 data/wordlists/wiktionary-teochew-index.yaml)
  npm run import -- wiktionary --backfill-tags (re-derive tags/alt_of for
                                                 already-staged proposals)

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
    const flags = rest.filter((a) => a.startsWith('--'))
    const explicitHeadwords = rest.filter((a) => !a.startsWith('--'))

    if (flags.includes('--backfill-tags')) {
      const staged = readStaging('wiktionary')
      if (!staged) {
        console.error('wiktionary --backfill-tags: no data/staging/wiktionary.yaml to backfill')
        process.exit(1)
      }
      const before = staged.proposals.filter((p) => (p.senses?.length ?? 0) > 0).length
      const proposals = backfillStagedTags(staged.proposals)
      const after = proposals.filter((p) => (p.senses?.length ?? 0) > 0).length
      const out = writeStaging({
        source: 'wiktionary',
        proposals,
        misses: staged.misses,
        notes: [`backfilled tags/alt_of from the wiktextract cache: ${after} of ${proposals.length} proposal(s) now tagged (${after - before} newly)`],
      })
      console.log(`backfilled tags → ${out}`)
      console.log(`${after} of ${proposals.length} proposal(s) now carry tags/alt_of (${after - before} newly tagged)`)
      break
    }

    const fromWordlist = flags.includes('--from-wordlist')
    const limitFlag = flags.find((f) => f.startsWith('--limit='))
    const delayFlag = flags.find((f) => f.startsWith('--delay='))
    const limit = limitFlag ? Number(limitFlag.slice('--limit='.length)) : undefined
    const delayMs = delayFlag ? Number(delayFlag.slice('--delay='.length)) : undefined

    const wordlist = fromWordlist ? loadWiktionaryWordlist() : null
    if (fromWordlist && !wordlist) {
      console.error(
        'wiktionary --from-wordlist: no data/wordlists/wiktionary-teochew-index.yaml — run `npm run wordlist:wiktionary` first',
      )
      process.exit(1)
    }

    const headwords = wordlist
      ? (() => {
          const toFetch = wordlist.items.filter((i) => i.status === 'to_fetch').map((i) => i.headword)
          return limit !== undefined ? toFetch.slice(0, limit) : toFetch
        })()
      : explicitHeadwords.length > 0
        ? explicitHeadwords
        : loadEntries()
            .filter(({ entry }) => entry.needs_review)
            .map(({ entry }) => entry.headword)

    if (headwords.length === 0) {
      console.log('nothing to fetch: no headwords given and no entries flagged needs_review')
      process.exit(0)
    }

    console.log(`fetching ${headwords.length} headword(s) from Wiktionary…`)
    const result = await importWiktionary(headwords, today, { delayMs })
    const merged = wordlist ? mergeImportResults(readStaging('wiktionary') ?? { proposals: [], misses: [] }, result) : result
    const out = writeStaging(merged)
    console.log(`${result.proposals.length} proposal(s) this run → ${out}`)
    for (const n of result.notes) console.log(`  ${n}`)
    if (result.misses.length > 0) {
      console.log(`  no Teochew reading found for: ${result.misses.join(', ')}`)
    }

    if (wordlist) {
      const resolved = new Set(result.proposals.map((p) => p.headword))
      const missed = new Set(result.misses)
      const updated = wordlist.items.map((item) => {
        if (resolved.has(item.headword)) return { ...item, status: 'staged' as const }
        if (missed.has(item.headword)) return { ...item, status: 'no_reading' as const }
        return item
      })
      writeWiktionaryWordlist(updated)
      const remaining = updated.filter((i) => i.status === 'to_fetch').length
      console.log(`  ${remaining} to_fetch item(s) remaining in the wordlist`)
    }
    break
  }

  default:
    console.error(`unknown import source '${source}'\n\n${USAGE}`)
    process.exit(2)
}
