import { readAudioStaging } from '../importers/audio-staging.js'
import { rehostClip, resolveProposal } from '../importers/lingualibre-rehost.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run rehost:lingualibre -- <index-or-commonsTitle>...`
 *
 * Downloads a staged Lingua Libre proposal's bytes from Commons, computes its
 * sha256, and uploads it to S3 (issue #270) — see
 * ../importers/lingualibre-rehost.js for the actual logic and
 * data/phonology/REVIEW.md § 16 for why re-hosting happens per-clip rather
 * than as a bulk operation over the whole staged corpus.
 */

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))

if (positional.length === 0) {
  console.error('usage: npm run rehost:lingualibre -- <proposal-index-or-commonsTitle>...')
  process.exit(2)
}

const staged = readAudioStaging('lingualibre')
if (!staged) {
  console.error('no data/staging/lingualibre.yaml — run `npm run import -- lingualibre` first')
  process.exit(1)
}

let failures = 0
for (const arg of positional) {
  const proposal = resolveProposal(arg, staged.proposals)
  if (!proposal) {
    console.error(`${red('✗')} no staged proposal matches '${arg}'`)
    failures += 1
    continue
  }

  console.log(dim(`re-hosting ${proposal.commonsTitle} (${proposal.pengim})…`))
  const { url, checksum } = await rehostClip(proposal)
  console.log(`${green('✓')} ${url}`)
  console.log(`  checksum: ${checksum}`)
}

if (failures > 0) process.exit(1)
