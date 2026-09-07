import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import type { Issue } from '../validate/index.js'
import { audioVerifyTargets, verifyAudioRemote, type AudioSource } from '../validate/audio-remote.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run audio:verify` — fetch every declared audio asset and verify its
 * checksum against the real bytes. That is both `url`/`checksum` and, when a
 * clip carries one, the CAF alternate's `cafUrl`/`cafChecksum` (issue #228) —
 * two independently uploaded Release assets, either of which can rot without
 * the other.
 *
 * Network-touching, so deliberately kept out of `npm run check` (same reason
 * `npm run xref`/`npm run import` are excluded) — `checkAudio` in
 * `src/validate/index.ts` already covers everything that can be checked
 * offline; this covers the rest.
 */

const sources: AudioSource[] = []
const loadIssues: Issue[] = []

for (const id of listAudioVarieties()) {
  const file = `data/phonology/audio/${id}.yaml`
  try {
    sources.push({ file, audio: loadAudio(id) })
  } catch (e) {
    loadIssues.push({ level: 'error', file, message: e instanceof Error ? e.message : String(e) })
  }
}

// Sized off the same walk the verifier uses, rather than re-counting clips
// here: a clip is not one fetch once it can carry a CAF alternate.
const assetCount = audioVerifyTargets(sources).length

console.log(dim(`fetching and checksumming ${assetCount} audio asset${assetCount === 1 ? '' : 's'}…`))

// A TTY can overwrite one progress line in place; a non-TTY (redirected to a
// file, piped, CI) can't usefully use \r, so it gets an occasional new line
// instead — either way, a run over thousands of clips (each a real network
// fetch) prints *something* before it finishes, rather than going silent.
const onProgress = process.stdout.isTTY
  ? (done: number, total: number) => process.stdout.write(`\r${dim(`${done}/${total} checked`)}`)
  : (done: number, total: number) => {
      if (done % 100 === 0 || done === total) console.log(dim(`${done}/${total} checked`))
    }

const issues = [...loadIssues, ...(await verifyAudioRemote(sources, { onProgress }))]
if (process.stdout.isTTY) process.stdout.write('\n')

for (const i of issues) {
  const where = [i.file, i.path].filter(Boolean).join(dim(' › '))
  console.log(`  ${red('error')} ${where}\n        ${i.message}`)
}

console.log(`\n${dim(`${issues.length} issue${issues.length === 1 ? '' : 's'}`)}`)

if (issues.length === 0) {
  console.log(green('✓ every audio clip resolved and checksummed cleanly'))
  process.exit(0)
}

console.log(red('✗ audio verification failed'))
process.exit(1)
