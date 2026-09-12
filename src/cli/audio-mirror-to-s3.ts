import { join } from 'node:path'

import { AUDIO_METADATA_DIR } from '../paths.js'
import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { filterToKeys, mirrorAudioToS3 } from '../importers/audio-mirror.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run audio:mirror-to-s3 -- [--write] [--variety=<id>] [--keys=<pengim-key>,...] [--overwrite]`
 *
 * Mirrors every clip/CAF asset already on GitHub Releases into S3 (issue
 * #270 step 3) — verifying each against the manifest's own checksum before
 * upload. See ../importers/audio-mirror.js for the actual logic. Does
 * **not** touch the manifest; that's a separate, later step
 * (`audio-manifest-rewrite-s3`) gated on the mobile app picking up the
 * widened schema first.
 *
 * `--keys` restricts the run to specific pengim keys (comma-separated;
 * quote a multi-syllable key with a space, e.g. `--keys="dio5 ziu1,geng1"`)
 * — for re-syncing a known-bad subset (e.g. every key a key-derivation
 * bug's fix affects) without re-scanning and re-verifying the whole corpus.
 *
 * `--overwrite` deliberately replaces a different clip already at a target
 * key instead of refusing (uploadBytesToS3's default) — for a leftover from
 * a fixed key-derivation bug, confirmed stale, not a routine resync. A
 * plain S3 PutObject already overwrites unconditionally on its own; this
 * only removes this project's own added safety check, so it's refused
 * without `--keys` too — an unscoped overwrite across the whole corpus is
 * exactly the silent-clobber failure mode that check exists to prevent.
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
const overwrite = args.includes('--overwrite')
const varietyFlag = args.find((a) => a.startsWith('--variety='))
const onlyVariety = varietyFlag ? varietyFlag.slice('--variety='.length) : undefined
const keysFlag = args.find((a) => a.startsWith('--keys='))
const onlyKeys = keysFlag ? new Set(keysFlag.slice('--keys='.length).split(',')) : undefined

if (overwrite && !onlyKeys) {
  console.error('--overwrite requires --keys — refusing to run an unscoped overwrite across the whole corpus')
  process.exit(2)
}

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
    const loaded = loadAudio(id)
    const audio = onlyKeys ? filterToKeys(loaded, onlyKeys) : loaded
    const result = await mirrorAudioToS3(audio, { write, overwrite })

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
