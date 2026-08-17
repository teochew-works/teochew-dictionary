import { stringify } from 'yaml'

import { loadWiktionaryWordlist } from '../data/wiktionary-wordlist.js'
import { readStaging } from '../importers/staging.js'
import type { Proposal } from '../importers/types.js'

/**
 * `npm run batch:wiktionary -- [--limit=N] [--include-flagged]` (issue #68)
 *
 * Lists the next batch of `data/wordlists/wiktionary-teochew-index.yaml`
 * items still `status: staged`, cross-referenced against their
 * `data/staging/wiktionary.yaml` proposal for readings/flags/retrieved.
 * Unflagged proposals (a single, unambiguous reading) come first unless
 * `--include-flagged` pulls from the multi-reading tail instead.
 *
 * Read-only — writing the entry into data/entries/ and flipping the
 * headword's status to `existing` stays a deliberate hand/agent act per
 * README's "Hand-merging Wiktionary candidates into entries" section.
 */

const args = process.argv.slice(2)
const limitFlag = args.find((a) => a.startsWith('--limit='))
const limit = limitFlag ? Number(limitFlag.slice('--limit='.length)) : 25
const includeFlagged = args.includes('--include-flagged')

const wordlist = loadWiktionaryWordlist()
if (!wordlist) {
  console.error('no data/wordlists/wiktionary-teochew-index.yaml — run `npm run wordlist:wiktionary` first')
  process.exit(1)
}

const staging = readStaging('wiktionary')
if (!staging) {
  console.error('no data/staging/wiktionary.yaml — run `npm run import -- wiktionary --from-wordlist` first')
  process.exit(1)
}

const proposalByHeadword = new Map(staging.proposals.map((p) => [p.headword, p]))

const stagedItems = wordlist.items.filter((item) => item.status === 'staged')
const stagedProposals = stagedItems
  .map((item) => proposalByHeadword.get(item.headword))
  .filter((p): p is Proposal => p !== undefined)

if (stagedProposals.length !== stagedItems.length) {
  console.error(
    `warning: ${stagedItems.length - stagedProposals.length} staged item(s) have no matching proposal in data/staging/wiktionary.yaml`,
  )
}

const unflagged = stagedProposals.filter((p) => (p.flags ?? []).length === 0)
const flagged = stagedProposals.filter((p) => (p.flags ?? []).length > 0)
const pool = includeFlagged ? flagged : unflagged
const batch = pool.slice(0, limit)

console.error(
  `${stagedItems.length} staged (${unflagged.length} unflagged, ${flagged.length} flagged) — ` +
    `batch: ${batch.length} of ${pool.length} ${includeFlagged ? 'flagged' : 'unflagged'} eligible`,
)
console.log(stringify(batch))
