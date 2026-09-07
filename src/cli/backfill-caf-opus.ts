import { join } from 'node:path'

import { AUDIO_METADATA_DIR } from '../paths.js'
import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { backfillCafOpus } from '../importers/caf-backfill.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run backfill:caf-opus -- [--write] [--variety=<id>]`
 *
 * Backfills `cafUrl`/`cafChecksum` (issue #228) onto every already-merged
 * `.webm` clip that doesn't have one yet, across every variety's audio
 * manifest (or just `--variety`). See ../importers/caf-backfill.js for the
 * actual logic — dry-run by default (still fetches and transcodes, to prove
 * the pipeline against real data, but uploads and writes nothing), `--write`
 * to commit. Network- and platform-touching (`afconvert` is macOS-only), so
 * deliberately excluded from `npm run check`, same as `audio:verify`.
 */

const args = process.argv.slice(2)
const write = args.includes('--write')
const varietyFlag = args.find((a) => a.startsWith('--variety='))
const onlyVariety = varietyFlag ? varietyFlag.slice('--variety='.length) : undefined

const varieties = listAudioVarieties().filter((id) => !onlyVariety || id === onlyVariety)

if (varieties.length === 0) {
  console.error(onlyVariety ? `no such audio variety: ${onlyVariety}` : 'no audio varieties found')
  process.exit(1)
}

let totalScanned = 0
let totalBackfilled = 0
let failures = 0

for (const id of varieties) {
  const path = join(AUDIO_METADATA_DIR, `${id}.yaml`)
  console.log(dim(`${id}: scanning ${path}…`))

  try {
    const audio = loadAudio(id)
    const result = await backfillCafOpus(path, audio, { write })

    totalScanned += result.scanned
    totalBackfilled += result.backfilled.length

    for (const b of result.backfilled) {
      console.log(`  ${green('✓')} ${b.bucket}.${b.key}[${b.index}] → ${b.cafUrl}`)
    }
    console.log(
      `  ${result.scanned} scanned, ${result.backfilled.length} ${write ? 'backfilled' : 'would backfill'}, ` +
        `${result.skippedHasCaf} already had cafUrl, ${result.skippedNotWebm} need no alternate`,
    )
  } catch (e) {
    console.error(`  ${red('✗')} ${e instanceof Error ? e.message : String(e)}`)
    failures += 1
  }
}

console.log(
  `\n${dim(
    `${totalScanned} clip(s) scanned across ${varieties.length} variet${varieties.length === 1 ? 'y' : 'ies'}, ` +
      `${totalBackfilled} ${write ? 'backfilled' : 'would backfill'}`,
  )}`,
)
if (!write) console.log(dim('dry run — pass --write to upload .caf assets and update the manifest'))

if (failures > 0) process.exit(1)
