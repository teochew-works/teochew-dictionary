import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { verifyAudioRemote } from '../validate/audio-remote.js'
import { dim, green, red } from './colour.js'

/**
 * `npm run audio:verify` — fetch every declared audio clip and verify its
 * checksum against the real bytes at `clip.url`.
 *
 * Network-touching, so deliberately kept out of `npm run check` (same reason
 * `npm run xref`/`npm run import` are excluded) — `checkAudio` in
 * `src/validate/index.ts` already covers everything that can be checked
 * offline; this covers the rest.
 */

const sources = listAudioVarieties().map((id) => ({ file: `data/phonology/audio/${id}.yaml`, audio: loadAudio(id) }))
const clipCount = sources.reduce((n, s) => n + Object.keys(s.audio.clips).length, 0)

console.log(dim(`fetching and checksumming ${clipCount} audio clip${clipCount === 1 ? '' : 's'}…`))

const issues = await verifyAudioRemote(sources)

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
