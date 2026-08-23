import { readAudioStaging } from '../importers/audio-staging.js'
import { mergeLinguaLibreClip, resolveProposal } from '../importers/lingualibre-merge.js'
import { CONFIDENCE } from '../schema/phonology.js'
import { listVarieties } from '../phonology/load.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run merge:lingualibre -- <index-or-commonsTitle> --variety=<id>
 *   [--confidence=high|medium|low] [--force] [--tag=audio-lingualibre]`
 *
 * Re-hosts one staged Lingua Libre proposal (see
 * ../importers/lingualibre-merge.js for the actual logic) and writes it into
 * data/phonology/audio/<variety>.yaml. `--variety` has no default: judging
 * accent fit stays a human call, per data/phonology/REVIEW.md § 16.
 */

const USAGE =
  'usage: npm run merge:lingualibre -- <proposal-index-or-commonsTitle> --variety=<id> ' +
  '[--confidence=high|medium|low] [--force] [--tag=audio-lingualibre]'

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))
const flagValue = (name: string): string | undefined => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3)

const variety = flagValue('variety')
const confidenceFlag = flagValue('confidence')
const tag = flagValue('tag')
const force = flags.includes('--force')

if (positional.length !== 1 || !variety) {
  console.error(USAGE)
  process.exit(2)
}

const varieties = listVarieties()
if (!varieties.includes(variety)) {
  console.error(`unknown variety '${variety}' (have: ${varieties.join(', ')})`)
  process.exit(2)
}

if (confidenceFlag && !(CONFIDENCE as readonly string[]).includes(confidenceFlag)) {
  console.error(`--confidence must be one of ${CONFIDENCE.join(', ')} (got '${confidenceFlag}')`)
  process.exit(2)
}

const staged = readAudioStaging('lingualibre')
if (!staged) {
  console.error('no data/staging/lingualibre.yaml — run `npm run import -- lingualibre` first')
  process.exit(1)
}

const arg = positional[0]!
const proposal = resolveProposal(arg, staged.proposals)
if (!proposal) {
  console.error(`no staged proposal matches '${arg}'`)
  process.exit(1)
}

try {
  const result = await mergeLinguaLibreClip(proposal, {
    variety,
    confidence: confidenceFlag as (typeof CONFIDENCE)[number] | undefined,
    force,
    tag,
  })
  console.log(`${green('✓')} merged '${result.key}' → ${result.bucket}.${JSON.stringify(result.key)} in ${result.path}`)
  console.log(`  source: ${result.sourceId}`)
  console.log(dim('  run `npm run validate` to confirm.'))
} catch (e) {
  console.error(`${red('✗')} ${(e as Error).message}`)
  process.exit(1)
}
