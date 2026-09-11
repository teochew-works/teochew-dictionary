import { join } from 'node:path'

import { AUDIO_METADATA_DIR } from '../paths.js'
import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { mirrorAudioToS3 } from '../importers/audio-mirror.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run audio:mirror-to-s3 -- [--write] [--variety=<id>]`
 *
 * Mirrors every clip/CAF asset already on GitHub Releases into S3 (issue
 * #270 step 3) — verifying each against the manifest's own checksum before
 * upload. See ../importers/audio-mirror.js for the actual logic. Does
 * **not** touch the manifest; that's a separate, later step
 * (`audio-manifest-rewrite-s3`) gated on the mobile app picking up the
 * widened schema first.
 *
 * Dry-run by default — still fetches and verifies every target, to prove
 * the corpus is intact before committing to anything, but uploads nothing
 * — `--write` to actually mirror. A target that fails (timeout, HTTP error,
 * checksum mismatch, a genuine AWS error) is reported and does not abort
 * the run — the exit code still reflects it. Idempotent and resumable: a
 * re-run after an interruption just re-verifies and re-skips whatever's
 * already mirrored. Network-touching, so deliberately excluded from
 * `npm run check`, same as `audio:verify`.
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
let totalMirrored = 0
let totalMismatches = 0
let totalFailed = 0
let failures = 0

for (const id of varieties) {
  const path = join(AUDIO_METADATA_DIR, `${id}.yaml`)
  console.log(dim(`${id}: scanning ${path}…`))

  try {
    const audio = loadAudio(id)
    const result = await mirrorAudioToS3(audio, { write })

    totalScanned += result.scanned
    totalMirrored += result.mirrored.length
    totalMismatches += result.mismatches.length
    totalFailed += result.failed.length

    for (const m of result.mismatches) {
      console.error(
        `  ${red('✗')} checksum mismatch: ${m.bucket}.${m.pengimKey}[${m.index}].${m.field} — expected ` +
          `${m.expectedChecksum}, got ${m.actualChecksum} (${m.sourceUrl})`,
      )
    }
    for (const f of result.failed) {
      console.error(`  ${red('✗')} ${f.bucket}.${f.pengimKey}[${f.index}].${f.field} — ${f.error} (${f.sourceUrl})`)
    }
    for (const a of result.mirrored) {
      console.log(`  ${green('✓')} ${a.bucket}.${a.pengimKey}[${a.index}].${a.field} → ${a.s3Url}`)
    }
    console.log(
      `  ${result.scanned} scanned, ${result.mirrored.length} ${write ? 'mirrored' : 'would mirror'}, ` +
        `${result.mismatches.length} checksum mismatch(es), ${result.failed.length} failed`,
    )
  } catch (e) {
    console.error(`  ${red('✗')} ${e instanceof Error ? e.message : String(e)}`)
    failures += 1
  }
}

console.log(
  `\n${dim(
    `${totalScanned} target(s) scanned across ${varieties.length} variet${varieties.length === 1 ? 'y' : 'ies'}, ` +
      `${totalMirrored} ${write ? 'mirrored' : 'would mirror'}, ${totalMismatches} checksum mismatch(es), ` +
      `${totalFailed} failed`,
  )}`,
)
if (!write) console.log(dim('dry run — pass --write to actually mirror to S3'))
if (totalMismatches > 0 || totalFailed > 0) failures += 1

if (failures > 0) process.exit(1)
