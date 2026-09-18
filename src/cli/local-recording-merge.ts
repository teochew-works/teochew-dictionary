import { readLocalRecordingStaging } from '../importers/local-recording-staging.js'
import { describeTake } from '../importers/clip-takes.js'
import { mergeLocalRecording, resolveLocalRecordingProposals } from '../importers/local-recording-merge.js'
import type { LocalRecordingProposal } from '../importers/local-recording-types.js'
import { CONFIDENCE } from '@teochew/core'
import { listVarieties } from '../phonology/load.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run merge:local-recording -- <index-or-pengim> --variety=<id>
 *   [--confidence=high|medium|low] [--speaker=<id>] [--all]
 *   [--primary[=<index-or-localPath>]]`
 *
 * Re-hosts staged local-recording proposals to S3 (issue #270; see
 * ../importers/local-recording-merge.js for the actual logic) and writes them
 * into data/phonology/audio/<variety>.yaml, then removes the now-redundant
 * staged proposals and local files. `--variety` has no default: judging accent
 * fit stays a human call, per data/phonology/REVIEW.md § 16/§ 17.
 *
 * `--speaker` assigns a speaker id at merge time for a proposal staged without
 * one (the elicitation UI, issue #288, defers this deliberately) — required
 * when a proposal has none, refused if it would silently override one the
 * proposal already carries.
 *
 * A pengim argument names *every* staged take of that syllable for
 * `--variety`, not just the first (ADR-0029, issue #290). With more than one
 * match this lists them and stops, unless `--all` says to merge them in
 * staging order: the first becomes this speaker's take 1 if they have nothing
 * published at the key yet, and the rest become takes 2, 3, … which are
 * training-only. `--primary=<index-or-localPath>` names which of them should
 * be the take a learner actually hears; with nothing named and a clip already
 * published, every new take is training-only and playback cannot change.
 *
 * `--force` is gone with ADR-0029: identical bytes are a no-op, and different
 * bytes get their own immutable asset path, so there is nothing to overwrite.
 */

const USAGE =
  'usage: npm run merge:local-recording -- <proposal-index-or-pengim> --variety=<id> ' +
  '[--confidence=high|medium|low] [--speaker=<id>] [--all] [--primary[=<index-or-localPath>]]'

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const positional = args.filter((a) => !a.startsWith('--'))
const flagValue = (name: string): string | undefined => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3)
const flagGiven = (name: string): boolean => flags.some((f) => f === `--${name}` || f.startsWith(`--${name}=`))

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
const all = boolFlag('all')
// `--primary` is two flags wearing one name: bare (or the boolean spelling
// `--primary=true`), it designates the single clip being merged; given an
// index or a localPath, it picks which of a `--all` batch is designated.
const primaryValue = flagValue('primary')
const primaryBoolean = primaryValue === 'true' || primaryValue === 'false'
const primaryTarget = primaryBoolean ? undefined : primaryValue
const primaryBare = flags.includes('--primary') || primaryValue === 'true'

if (flagGiven('force')) {
  console.error(
    '--force was retired with ADR-0029 (issue #290): a merge can no longer overwrite anything. Identical bytes ' +
      'are a no-op, and a re-recording appends as its own take — pass --primary if it should be the published one.',
  )
  process.exit(2)
}

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
// Narrowed by --variety for a pengim argument only: merging a proposal into a
// variety other than the one it was staged under is a judgment a human may
// make, and naming its index is how they say so explicitly.
const matches = resolveLocalRecordingProposals(arg, staged.proposals, { variety })
if (matches.length === 0) {
  console.error(`no staged proposal matches '${arg}'`)
  process.exit(1)
}

const indexOf = (proposal: LocalRecordingProposal): number => staged.proposals.indexOf(proposal)

if (matches.length > 1 && !all) {
  console.error(`'${arg}' matches ${matches.length} staged proposals for '${variety}':`)
  for (const match of matches) {
    console.error(`  ${indexOf(match)}  ${match.localPath}  (recorded ${match.recordedDate})`)
  }
  console.error('pass one of those indices to merge just it, or --all to merge every take.')
  process.exit(1)
}

/** The one proposal `--primary=<index-or-localPath>` names, or `undefined` when the flag designates the (single) merged clip. */
function designatedPrimary(): LocalRecordingProposal | undefined {
  if (primaryTarget === undefined) return undefined
  const designated = matches.find((m) => m.localPath === primaryTarget || String(indexOf(m)) === primaryTarget)
  if (!designated) {
    console.error(
      `--primary=${primaryTarget} names none of the ${matches.length} proposals being merged — ` +
        `use a staging index (${matches.map(indexOf).join(', ')}) or a localPath`,
    )
    process.exit(2)
  }
  return designated
}

if (all && primaryBare && primaryTarget === undefined && matches.length > 1) {
  console.error(
    'with --all, --primary must name which take to publish (--primary=<index-or-localPath>) — ' +
      'only one of a speaker\'s takes can be the published one',
  )
  process.exit(2)
}

const primaryProposal = designatedPrimary()

const speakerFlag = flagValue('speaker')
for (const proposal of matches) {
  if (proposal.speaker && speakerFlag !== undefined && speakerFlag !== proposal.speaker) {
    console.error(
      `proposal for '${proposal.pengim}' already has speaker '${proposal.speaker}' — ` +
        `--speaker=${speakerFlag} would override it; omit --speaker or pass the matching value`,
    )
    process.exit(2)
  }
  if (!proposal.speaker && !speakerFlag) {
    console.error(`proposal for '${proposal.pengim}' has no speaker yet — pass --speaker=<id> to assign one now`)
    process.exit(2)
  }
}

/**
 * `proposal`'s index in staging *now*. Each merge splices the merged proposal
 * out of the sequence, so an index captured up front goes stale the moment a
 * bulk merge removes an earlier one — `localPath` (a timestamped filename, one
 * per recording) is the stable handle, so the index is re-read per merge.
 */
function currentIndex(proposal: LocalRecordingProposal): number | undefined {
  const now = readLocalRecordingStaging()
  const index = now?.proposals.findIndex((p) => p.localPath === proposal.localPath) ?? -1
  return index === -1 ? undefined : index
}

for (const proposal of matches) {
  const resolvedProposal = proposal.speaker ? proposal : { ...proposal, speaker: speakerFlag! }

  try {
    const result = await mergeLocalRecording(resolvedProposal, {
      variety,
      confidence: confidenceFlag as (typeof CONFIDENCE)[number] | undefined,
      // A bare --primary designates the single clip being merged; a valued one
      // designates whichever of a batch it named.
      primary: primaryProposal ? primaryProposal === proposal : primaryBare && primaryTarget === undefined,
      proposalIndex: currentIndex(proposal),
    })

    if (result.disposition === 'already-merged') {
      // Exit 0, not an error: the clip is published, which is the outcome the
      // human wanted. Re-running a merge must be free of surprises.
      console.log(`${green('✓')} '${result.key}' is already merged — these exact bytes are at ${result.url}`)
      console.log(dim('  nothing uploaded, nothing written.'))
    } else {
      console.log(`${green('✓')} merged '${result.key}' → clips.${JSON.stringify(result.key)} in ${result.path}`)
      console.log(`  ${describeTake(result)}`)
      console.log(`  url: ${result.url}`)
    }
  } catch (e) {
    console.error(`${red('✗')} ${(e as Error).message}`)
    process.exit(1)
  }
}

console.log(dim('  run `npm run validate` to confirm.'))
