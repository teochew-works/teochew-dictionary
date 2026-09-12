import { join } from 'node:path'

import { AUDIO_METADATA_DIR } from '../paths.js'
import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { rewriteManifestToS3 } from '../importers/audio-manifest-rewrite.js'
import { dim, red } from './colour.js'

/**
 * `npm run audio:manifest-rewrite-s3 -- [--write] [--variety=<id>]`
 *
 * Rewrites `url`/`cafUrl` in every audio manifest from GitHub Release URLs
 * to the CloudFront mirror (issue #270 step 4) — the final step of the S3
 * migration. See ../importers/audio-manifest-rewrite.js for the actual
 * logic. Only run this once the `packages/core` release and mobile-app pin
 * bump (ADR-0026) have shipped — an app still validating against the old
 * core version would reject every rewritten URL.
 *
 * Dry-run by default — still HEAD-checks every target's CloudFront object,
 * to prove the corpus is ready before committing to anything, but writes
 * nothing — `--write` to actually rewrite. A target whose object isn't
 * confirmed present yet is left pointing at GitHub and reported, not
 * silently skipped — run `npm run audio:mirror-to-s3 -- --write` first if
 * any show up. Network-touching, so deliberately excluded from
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
let totalRewritten = 0
let totalNotYetMirrored = 0
let totalFailed = 0
let failures = 0

for (const id of varieties) {
  const path = join(AUDIO_METADATA_DIR, `${id}.yaml`)
  console.log(dim(`${id}: scanning ${path}…`))

  try {
    const audio = loadAudio(id)
    const result = await rewriteManifestToS3(path, audio, { write })

    totalScanned += result.scanned
    totalRewritten += result.rewritten.length
    totalNotYetMirrored += result.notYetMirrored.length
    totalFailed += result.failed.length

    for (const t of result.notYetMirrored) {
      console.error(`  ${red('✗')} not yet mirrored: ${t.bucket}.${t.pengimKey}[${t.index}].${t.field} → ${t.newUrl}`)
    }
    for (const f of result.failed) {
      console.error(`  ${red('✗')} ${f.bucket}.${f.pengimKey}[${f.index}].${f.field} — ${f.error} (${f.newUrl})`)
    }
    console.log(
      `  ${result.scanned} scanned, ${result.rewritten.length} ${write ? 'rewritten' : 'would rewrite'}, ` +
        `${result.notYetMirrored.length} not yet mirrored, ${result.failed.length} failed`,
    )
  } catch (e) {
    console.error(`  ${red('✗')} ${e instanceof Error ? e.message : String(e)}`)
    failures += 1
  }
}

console.log(
  `\n${dim(
    `${totalScanned} target(s) scanned across ${varieties.length} variet${varieties.length === 1 ? 'y' : 'ies'}, ` +
      `${totalRewritten} ${write ? 'rewritten' : 'would rewrite'}, ${totalNotYetMirrored} not yet mirrored, ` +
      `${totalFailed} failed`,
  )}`,
)
if (!write) console.log(dim('dry run — pass --write to actually rewrite the manifest'))
if (totalNotYetMirrored > 0 || totalFailed > 0) failures += 1

if (failures > 0) process.exit(1)
