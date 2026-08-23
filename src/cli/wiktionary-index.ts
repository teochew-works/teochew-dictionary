import { loadEntries } from '../data/load.js'
import {
  classifyAgainstEntries,
  loadWiktionaryWordlist,
  writeWiktionaryWordlist,
  type WiktionaryWordlistStatus,
} from '../data/wiktionary-wordlist.js'
import { searchTeochewPages } from '../importers/wiktionary-search.js'
import { WIKTIONARY_WORDLIST_FILE } from '../paths.js'

/**
 * `npm run wordlist:wiktionary` — regenerate
 * data/wordlists/wiktionary-teochew-index.yaml (issue #54) by paginating
 * Wiktionary's CirrusSearch `insource:/mn-t=/` search (namespace 0) and
 * classifying each hit against the current lexicon.
 *
 * Network-dependent, unlike `npm run inventory`. Preserves any staged/
 * no_reading progress already recorded — see ../data/wiktionary-wordlist.ts.
 */

const previous = loadWiktionaryWordlist()

console.log('enumerating Wiktionary pages with a Teochew reading…')
const titles = await searchTeochewPages({
  onPage: (page, query, offset) => console.log(`  +${page.titles.length} title(s) (offset ${offset}) — ${query}`),
})
console.log(`${titles.length} candidate page(s) found`)

const entries = loadEntries()
const items = classifyAgainstEntries(titles, entries, previous)
writeWiktionaryWordlist(items)

const counts: Record<WiktionaryWordlistStatus, number> = {
  existing: 0,
  to_fetch: 0,
  staged: 0,
  no_reading: 0,
  no_gloss: 0,
}
for (const item of items) counts[item.status] += 1

console.log(`→ ${WIKTIONARY_WORDLIST_FILE}`)
console.log(`  existing: ${counts.existing}`)
console.log(`  to_fetch: ${counts.to_fetch}`)
console.log(`  staged: ${counts.staged}`)
console.log(`  no_reading: ${counts.no_reading}`)
console.log(`  no_gloss: ${counts.no_gloss}`)
