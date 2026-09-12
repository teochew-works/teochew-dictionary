import { join } from 'node:path'

import { mergeResynth, readResynthReport, resynthReportPath } from '../importers/resynth-merge.js'
import { AUDIO_METADATA_DIR } from '../paths.js'
import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { dim, green, red, yellow } from './colour.js'

/**
 * `npm run merge:resynth -- [--write] [--force] [--variety=<id>] [--only=<key,…>]
 *  [--skip-caf]` (ADR-0027, issue #259)
 *
 * Publishes the renders `npm run audio:synthesize -- --write` left in
 * `.cache/audio-synth/<variety>/` — the ones that passed their self-check —
 * as the variety's derived speaker tier: encodes, uploads to S3 behind
 * CloudFront (issue #270), and appends a `<speaker>-n` clip beside each
 * recording in `data/phonology/audio/<variety>.yaml`. See
 * ../importers/resynth-merge.js.
 *
 * Network-touching and a real, visible act against the live bucket, so it
 * is dry-run by default (still encodes every clip) and a human runs it on
 * purpose — the same rule as `merge:local-recording` (ADR-0017). Needs
 * `ffmpeg`, AWS credentials for the `teochew-dictionary-audio` bucket
 * (`AUDIO_BUCKET_REGION`, s3-upload.ts), and — unless `--skip-caf` —
 * macOS's `afconvert`.
 */

const USAGE = `usage:
  npm run merge:resynth                          dry run: encode every passing render, upload and write nothing
  npm run merge:resynth -- --write               upload and append the <speaker>-n clips to the manifest
  npm run merge:resynth -- --only=du2,dua7       just these syllables
  npm run merge:resynth -- --force               replace a syllable's existing render by the same speaker id
  npm run merge:resynth -- --variety=chaozhou    one variety
  npm run merge:resynth -- --skip-caf            no CAF sibling (afconvert is macOS-only)`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

const write = args.includes('--write')
const force = args.includes('--force')
const skipCaf = args.includes('--skip-caf')
const varietyFlag = args.find((a) => a.startsWith('--variety='))
const onlyVariety = varietyFlag ? varietyFlag.slice('--variety='.length) : undefined
const onlyFlag = args.find((a) => a.startsWith('--only='))
const only = onlyFlag?.slice('--only='.length).split(',').map((k) => k.trim()).filter(Boolean)

const varieties = listAudioVarieties().filter((id) => !onlyVariety || id === onlyVariety)
if (varieties.length === 0) {
  console.error(red(onlyVariety ? `no such audio variety: ${onlyVariety}` : 'no audio varieties found'))
  process.exit(1)
}

let totalMerged = 0
let failures = 0

for (const id of varieties) {
  const path = join(AUDIO_METADATA_DIR, `${id}.yaml`)
  const report = readResynthReport(id)
  if (report === null) {
    console.log(dim(`${id}: no ${resynthReportPath(id)} — run \`npm run audio:synthesize -- --write\` first`))
    continue
  }
  console.log(dim(`${id}: ${Object.keys(report.clips).length} render(s) in the report from ${report.generated}`))

  try {
    const result = await mergeResynth(path, loadAudio(id), report, { write, force, only, skipCaf })
    totalMerged += result.merged.length

    for (const m of result.merged) console.log(`  ${green('✓')} ${m.key} → ${m.speaker}: ${m.url}`)
    for (const e of result.errors) {
      failures += 1
      console.log(`  ${red('error')} ${e.key}: ${e.message}`)
    }
    console.log(
      `  ${result.scanned} scanned, ${result.merged.length} ${write ? 'merged' : 'would merge'}, ` +
        `${result.skippedFailedCheck} failed their self-check, ${result.skippedAlreadyMerged} already merged` +
        (result.skippedAlreadyMerged > 0 && !force ? ` ${dim('(--force to replace)')}` : ''),
    )
    if (result.skippedFailedCheck > 0) {
      console.log(yellow(`  ${result.skippedFailedCheck} render(s) skipped — listen to them and re-run audio:synthesize, or leave them unpublished`))
    }
  } catch (e) {
    console.error(`  ${red('✗')} ${e instanceof Error ? e.message : String(e)}`)
    failures += 1
  }
}

console.log(`\n${dim(`${totalMerged} render(s) ${write ? 'merged' : 'would be merged'}`)}`)
if (!write) console.log(dim('dry run — pass --write to upload the assets and update the manifest'))

if (failures > 0) process.exit(1)
