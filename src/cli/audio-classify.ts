import { dtwDistance } from '@teochew/core'
import { checksumHex, clipCachePath, ensureClipCached, manifestClips, type ManifestClip } from '../audio/clip-cache.js'
import {
  DEFAULT_MFCC_PARAMS,
  emptyMfccCache,
  extractMfcc,
  loadMfccCache,
  saveMfccCache,
  type MfccTarget,
} from '../audio/mfcc.js'
import { AUDIO_MFCC_FILE } from '../paths.js'
import { loadAudio } from '../phonology/load.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { bold, cyan, dim, red } from './colour.js'

/**
 * `npm run audio:classify -- <path-to-clip> [--variety=chaozhou] [--speaker=jky]
 * [--top=5] [--refresh]` (issue #279)
 *
 * A self-check, not a dictionary feature: "did I actually say the syllable I
 * meant to?" Ranks an arbitrary clip of the given speaker's own voice against
 * every one of that speaker's reference clips by DTW distance over MFCC
 * features — classical same-speaker template matching, chosen because the
 * corpus has exactly one genuine take per syllable (too sparse to train a
 * classifier on).
 *
 * Restricting the reference bank to one `speaker` (default `jky`) is what
 * makes this "your own speech only," not general ASR — it also excludes a
 * `<speaker>-n` synthesis tier (ADR-0027) automatically, since those clips
 * carry a different `speaker` string in the same manifest entry.
 *
 * Network-touching the first time (fills `.cache/audio-clips/` for any
 * reference not already cached from a prior `audio:grade`/`audio:verify`
 * run), so kept out of `npm run check` like every other `audio:*` command.
 * Incremental after that: a cached reference's MFCC is not re-extracted;
 * `--refresh` re-extracts everything (after changing extractor parameters).
 */

const USAGE = `usage:
  npm run audio:classify -- <path-to-clip>                    rank against every jky/chaozhou reference
  npm run audio:classify -- clip.webm --variety=shantou        a different variety
  npm run audio:classify -- clip.webm --speaker=jky            a different reference speaker
  npm run audio:classify -- clip.webm --top=10                 print more/fewer candidates (default 5)
  npm run audio:classify -- clip.webm --refresh                re-extract MFCC for every reference`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

function numberFlag(name: string, fallback: number): number {
  const flag = args.find((a) => a.startsWith(`--${name}=`))
  if (!flag) return fallback
  const value = Number(flag.slice(name.length + 3))
  if (!Number.isFinite(value) || value < 0) {
    console.error(`${flag}: expected a non-negative number\n\n${USAGE}`)
    process.exit(2)
  }
  return value
}

const clipPath = args.find((a) => !a.startsWith('--'))
if (!clipPath) {
  console.error(`missing <path-to-clip>\n\n${USAGE}`)
  process.exit(2)
}

const variety = args.find((a) => a.startsWith('--variety='))?.slice('--variety='.length) ?? 'chaozhou'
const speaker = args.find((a) => a.startsWith('--speaker='))?.slice('--speaker='.length) ?? 'jky'
const top = numberFlag('top', 5)
const refresh = args.includes('--refresh')

ensureCacheSymlinkOrExit('classify')

let audio
try {
  audio = loadAudio(variety)
} catch (e) {
  console.error(red(e instanceof Error ? e.message : String(e)))
  process.exit(1)
}

const refs = manifestClips(audio).filter((m) => m.clip.speaker === speaker)
if (refs.length === 0) {
  console.error(red(`no clips for speaker '${speaker}' in variety '${variety}'`))
  process.exit(1)
}

const isTTY = process.stdout.isTTY
function progress(label: string, every: number): (done: number, total: number) => void {
  return isTTY
    ? (done, total) => process.stdout.write(`\r${dim(`${done}/${total} ${label}`)}`)
    : (done, total) => {
        if (done % every === 0 || done === total) console.log(dim(`${done}/${total} ${label}`))
      }
}
function endProgress(): void {
  if (isTTY) process.stdout.write('\n')
}

// 1. Bytes. One fetch per reference clip ever, keyed by checksum.
console.log(bold(`${variety}: ${refs.length} reference clip${refs.length === 1 ? '' : 's'} (speaker: ${speaker})`))
const cached: ManifestClip[] = []
const onFetch = progress('cached', 100)
let failures = 0
for (const [i, entry] of refs.entries()) {
  const result = await ensureClipCached(entry.clip)
  if (result.ok) {
    cached.push(entry)
  } else {
    failures += 1
    console.log(`\n  ${red('error')} ${entry.path}: ${result.error}`)
  }
  onFetch(i + 1, refs.length)
}
endProgress()

// 2. MFCC. Extracted once per checksum unless --refresh.
const cache = (refresh ? null : loadMfccCache()) ?? emptyMfccCache(DEFAULT_MFCC_PARAMS)
const pending: MfccTarget[] = cached
  .filter((entry) => refresh || cache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pending.length > 0) {
  console.log(dim(`  extracting MFCC for ${pending.length} reference clip${pending.length === 1 ? '' : 's'}…`))
  const result = extractMfcc(pending, { params: cache.params, onProgress: progress('analysed', 1) })
  endProgress()
  Object.assign(cache.clips, result.clips)
  for (const [clipId, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${clipId}: ${message}`)
  }
  saveMfccCache(cache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_MFCC_FILE}`))
} else {
  console.log(dim(`  MFCC already cached for every reference (${AUDIO_MFCC_FILE})`))
}

// 3. The query clip: decoded and extracted the same way, but never cached —
// it isn't part of the corpus.
const queryId = '__query__'
const queryResult = extractMfcc([{ id: queryId, webmPath: clipPath }], { params: cache.params })
if (queryResult.errors[queryId]) {
  console.error(red(`could not analyse ${clipPath}: ${queryResult.errors[queryId]}`))
  process.exit(1)
}
const query = queryResult.clips[queryId]!.frames

// 4. Rank every reference whose MFCC extraction succeeded.
const candidates = cached.flatMap((entry) => {
  const frames = cache.clips[checksumHex(entry.clip.checksum)]?.frames
  return frames ? [{ key: entry.key, clip: entry.clip, distance: dtwDistance(query, frames) }] : []
})
candidates.sort((a, b) => a.distance - b.distance)

console.log(`\n  ${bold('closest matches')}`)
for (const [i, c] of candidates.slice(0, top).entries()) {
  console.log(
    `  ${String(i + 1).padStart(2)}. ${bold(cyan(c.key.padEnd(10)))} ${dim(c.distance.toFixed(3))}  ${dim(`(${c.clip.speaker ?? '?'}, ${c.clip.confidence})`)}`,
  )
}

if (failures > 0) {
  console.log(red(`\n✗ ${failures} reference clip${failures === 1 ? '' : 's'} could not be fetched or analysed`))
  process.exit(1)
}
