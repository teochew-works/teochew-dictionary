import { dtwDistance } from '@teochew/core'
import { type EvalCase, formatAccuracy, tallyAccuracy } from '../audio/eval.js'
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
import { bold, dim, green, red } from './colour.js'

/**
 * `npm run audio:classify-eval -- [--variety=chaozhou] [--reference-speaker=jky]
 * [--query-speaker=jky-n] [--refresh]` (issue #280)
 *
 * Held-out accuracy for #279's whole-syllable DTW/MFCC classifier: every
 * `query-speaker` clip (by default the `jky-n` WORLD-retuned resynthesis
 * tier, ADR-0027 — a genuine re-rendering, not a byte-copy) ranked against
 * every `reference-speaker` clip, tallied into top-1/3/5. This is the
 * baseline #280's axis classifier is measured against; formalises the ad hoc
 * script that produced the 54.1%/64.6%/69.3% numbers quoted in that issue.
 *
 * Network-touching and slow (~3,000 queries × ~3,000 references), so kept
 * out of `npm run check` like every other `audio:*` command. Incremental:
 * both reference and query clips are real corpus clips with stable
 * checksums, so their MFCC is cached and re-extracted only for new/changed
 * clips, not on every eval run.
 */

const USAGE = `usage:
  npm run audio:classify-eval                                        jky-n queries vs jky references, chaozhou
  npm run audio:classify-eval -- --variety=shantou                    a different variety
  npm run audio:classify-eval -- --reference-speaker=jky --query-speaker=jky-n
  npm run audio:classify-eval -- --refresh                            re-extract MFCC for every clip`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

function flag(name: string, fallback: string): string {
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
}

const variety = flag('variety', 'chaozhou')
const referenceSpeaker = flag('reference-speaker', 'jky')
const querySpeaker = flag('query-speaker', 'jky-n')
const refresh = args.includes('--refresh')

ensureCacheSymlinkOrExit('classify-eval')

let audio
try {
  audio = loadAudio(variety)
} catch (e) {
  console.error(red(e instanceof Error ? e.message : String(e)))
  process.exit(1)
}

const all = manifestClips(audio)
const refs = all.filter((m) => m.clip.speaker === referenceSpeaker)
const queries = all.filter((m) => m.clip.speaker === querySpeaker)
if (refs.length === 0) {
  console.error(red(`no clips for reference speaker '${referenceSpeaker}' in variety '${variety}'`))
  process.exit(1)
}
if (queries.length === 0) {
  console.error(red(`no clips for query speaker '${querySpeaker}' in variety '${variety}'`))
  process.exit(1)
}

console.log(
  bold(
    `${variety}: ${refs.length} reference clip${refs.length === 1 ? '' : 's'} (${referenceSpeaker}), ` +
      `${queries.length} held-out quer${queries.length === 1 ? 'y' : 'ies'} (${querySpeaker})`,
  ),
)

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

// 1. Bytes for both sets — a query is a real corpus clip here, not an
// arbitrary external file, so it's fetched and cached the same way.
const targets = [...refs, ...queries]
const cached: ManifestClip[] = []
const onFetch = progress('cached', 200)
let failures = 0
for (const [i, entry] of targets.entries()) {
  const result = await ensureClipCached(entry.clip)
  if (result.ok) {
    cached.push(entry)
  } else {
    failures += 1
    console.log(`\n  ${red('error')} ${entry.path}: ${result.error}`)
  }
  onFetch(i + 1, targets.length)
}
endProgress()

// 2. MFCC for both sets, sharing one cache keyed by checksum.
const cache = (refresh ? null : loadMfccCache()) ?? emptyMfccCache(DEFAULT_MFCC_PARAMS)
const pending: MfccTarget[] = cached
  .filter((entry) => refresh || cache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pending.length > 0) {
  console.log(dim(`  extracting MFCC for ${pending.length} clip${pending.length === 1 ? '' : 's'}…`))
  const result = extractMfcc(pending, { params: cache.params, onProgress: progress('analysed', 50) })
  endProgress()
  Object.assign(cache.clips, result.clips)
  for (const [clipId, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${clipId}: ${message}`)
  }
  saveMfccCache(cache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_MFCC_FILE}`))
} else {
  console.log(dim(`  MFCC already cached for every clip (${AUDIO_MFCC_FILE})`))
}

// 3. Rank every held-out query against every reference by DTW distance.
const cachedRefs = refs.filter((r) => cached.includes(r) && cache.clips[checksumHex(r.clip.checksum)])
const cachedQueries = queries.filter((q) => cached.includes(q) && cache.clips[checksumHex(q.clip.checksum)])

console.log(dim(`  ranking ${cachedQueries.length} queries against ${cachedRefs.length} references…`))
const onRank = progress('ranked', 100)
const cases: EvalCase[] = cachedQueries.map((query, i) => {
  const queryFrames = cache.clips[checksumHex(query.clip.checksum)]!.frames
  const candidates = cachedRefs.map((ref) => ({
    key: ref.key,
    distance: dtwDistance(queryFrames, cache.clips[checksumHex(ref.clip.checksum)]!.frames),
  }))
  candidates.sort((a, b) => a.distance - b.distance)
  onRank(i + 1, cachedQueries.length)
  return { truthKey: query.key, candidates }
})
endProgress()

console.log(`\n${formatAccuracy(`whole-syllable DTW/MFCC (${querySpeaker} vs ${referenceSpeaker})`, tallyAccuracy(cases))}`)

if (failures > 0) {
  console.log(red(`\n✗ ${failures} clip${failures === 1 ? '' : 's'} could not be fetched or analysed`))
  process.exit(1)
}
console.log(green('\n✓ eval complete'))
