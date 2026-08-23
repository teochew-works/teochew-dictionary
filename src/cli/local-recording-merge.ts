import { readLocalRecordingStaging } from '../importers/local-recording-staging.js'
import { mergeLocalRecording, resolveLocalRecordingProposal } from '../importers/local-recording-merge.js'
import { CONFIDENCE } from '../schema/phonology.js'
import { listVarieties } from '../phonology/load.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run merge:local-recording -- <index-or-pengim> --variety=<id>
 *   [--confidence=high|medium|low] [--force] [--tag=audio-teochew-dictionary-audio]`
 *
 * Re-hosts one staged local-recording proposal (see
 * ../importers/local-recording-merge.js for the actual logic) and writes it
 * into data/phonology/audio/<variety>.yaml, then removes the now-redundant
 * staged proposal and local file. `--variety` has no default: judging accent
 * fit stays a human call, per data/phonology/REVIEW.md § 16/§ 17.
 */

const USAGE =
  'usage: npm run merge:local-recording -- <proposal-index-or-pengim> --variety=<id> ' +
  '[--confidence=high|medium|low] [--force] [--tag=audio-teochew-dictionary-audio]'

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))
const flagValue = (name: string): string | undefined => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3)

/**
 * A boolean flag accepts a bare `--name` (true) or an explicit
 * `--name=true`/`--name=false`; anything else (e.g. `--name=yes`) is a usage
 * error rather than being silently treated as false.
 */
function boolFlag(name: string): boolean {
  if (flags.includes(`--${name}`)) return true
  const value = flagValue(name)
  if (value === undefined || value === 'false') return false
  if (value === 'true') return true
  console.error(`--${name} takes no value, or 'true'/'false' (got '--${name}=${value}')`)
  process.exit(2)
}

const variety = flagValue('variety')
const confidenceFlag = flagValue('confidence')
const tag = flagValue('tag')
const force = boolFlag('force')

if (positional.length !== 1 || !variety) {
  console.error(USAGE)
  process.exit(2)
}

const varieties = listVarieties()
if (!varieties.includes(variety)) {
  console.error(`unknown variety '${variety}' (have: ${varieties.join(', ')})`)
  process.exit(2)
}

if (confidenceFlag !== undefined && !(CONFIDENCE as readonly string[]).includes(confidenceFlag)) {
  console.error(`--confidence must be one of ${CONFIDENCE.join(', ')} (got '${confidenceFlag}')`)
  process.exit(2)
}

const staged = readLocalRecordingStaging()
if (!staged) {
  console.error('no data/staging/teochew-dictionary-audio.yaml — record a clip from the Sounds tab first')
  process.exit(1)
}

const arg = positional[0]!
const proposal = resolveLocalRecordingProposal(arg, staged.proposals)
if (!proposal) {
  console.error(`no staged proposal matches '${arg}'`)
  process.exit(1)
}
const proposalIndex = staged.proposals.indexOf(proposal)

try {
  const result = await mergeLocalRecording(proposal, {
    variety,
    confidence: confidenceFlag as (typeof CONFIDENCE)[number] | undefined,
    force,
    tag,
    proposalIndex,
  })
  console.log(`${green('✓')} merged '${result.key}' → clips.${JSON.stringify(result.key)} in ${result.path}`)
  console.log(`  url: ${result.url}`)
  console.log(dim('  run `npm run validate` to confirm.'))
} catch (e) {
  console.error(`${red('✗')} ${(e as Error).message}`)
  process.exit(1)
}
