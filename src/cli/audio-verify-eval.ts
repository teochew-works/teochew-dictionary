import { computeAxisCandidates, rimeOf, type AxisReferenceClip, type RankedCandidate } from '@teochew/core'
import { buildAxisReferences } from '../audio/axis-references.js'
import { checksumHex, clipCachePath, ensureClipCached, manifestClips, type ManifestClip } from '../audio/clip-cache.js'
import { type EvalCase, formatAccuracy, tallyAccuracy } from '../audio/eval.js'
import {
  DEFAULT_ANALYSIS_PARAMS,
  emptyFeaturesCache,
  extractFeatures,
  loadFeaturesCache,
  saveFeaturesCache,
  type FeatureTarget,
} from '../audio/features.js'
import {
  DEFAULT_MFCC_PARAMS,
  emptyMfccCache,
  extractMfcc,
  loadMfccCache,
  saveMfccCache,
  type MfccTarget,
} from '../audio/mfcc.js'
import { targetAxisFilters } from '../audio/target-filters.js'
import { AUDIO_FEATURES_FILE, AUDIO_MFCC_FILE } from '../paths.js'
import { loadAudio, loadPengimScheme } from '../phonology/load.js'
import { parseSyllable } from '../phonology/syllable.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { bold, dim, green, red } from './colour.js'

/**
 * `npm run audio:verify-eval -- [--variety=chaozhou] [--speaker=jky] [--refresh]`
 * (issue #280's per-axis accuracy follow-up)
 *
 * Measures the tone/rime *known-target* gating this issue's follow-up
 * proposed: leave-one-out over every `speaker` clip (each ranked against
 * the other N-1, its own label treated as the already-known target — the
 * training-data-QC/synthesis-verification scenario, never a blind mic
 * query), tone restricted to references sharing the target's checkedness
 * and rime restricted to references sharing its nasalisation+coda class
 * (`targetAxisFilters`), reported against the unfiltered leave-one-out
 * baseline. Initial is unaffected by either filter, so it's left out.
 *
 * Network-touching and leave-one-out is O(n²) DTW, so kept out of
 * `npm run check` like every other `audio:*` command.
 */

const USAGE = `usage:
  npm run audio:verify-eval                          jky, chaozhou, leave-one-out
  npm run audio:verify-eval -- --variety=shantou      a different variety
  npm run audio:verify-eval -- --speaker=jky-n        a different speaker
  npm run audio:verify-eval -- --refresh              re-extract MFCC/features for every clip`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

function flag(name: string, fallback: string): string {
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
}

const variety = flag('variety', 'chaozhou')
const speaker = flag('speaker', 'jky')
const refresh = args.includes('--refresh')

ensureCacheSymlinkOrExit('verify-eval')

let audio
try {
  audio = loadAudio(variety)
} catch (e) {
  console.error(red(e instanceof Error ? e.message : String(e)))
  process.exit(1)
}
const scheme = loadPengimScheme()

const targets = manifestClips(audio).filter((m) => m.clip.speaker === speaker)
if (targets.length === 0) {
  console.error(red(`no clips for speaker '${speaker}' in variety '${variety}'`))
  process.exit(1)
}
console.log(bold(`${variety}: ${targets.length} ${speaker} clip${targets.length === 1 ? '' : 's'}, leave-one-out`))

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

const mfccCache = (refresh ? null : loadMfccCache()) ?? emptyMfccCache(DEFAULT_MFCC_PARAMS)
const pendingMfcc: MfccTarget[] = cached
  .filter((entry) => refresh || mfccCache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pendingMfcc.length > 0) {
  console.log(dim(`  extracting MFCC for ${pendingMfcc.length} clip${pendingMfcc.length === 1 ? '' : 's'}…`))
  const result = extractMfcc(pendingMfcc, { params: mfccCache.params, onProgress: progress('analysed', 50) })
  endProgress()
  Object.assign(mfccCache.clips, result.clips)
  for (const [id, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${id}: ${message}`)
  }
  saveMfccCache(mfccCache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_MFCC_FILE}`))
} else {
  console.log(dim(`  MFCC already cached for every clip (${AUDIO_MFCC_FILE})`))
}

const featuresCache = (refresh ? null : loadFeaturesCache()) ?? emptyFeaturesCache(DEFAULT_ANALYSIS_PARAMS)
const pendingFeatures: FeatureTarget[] = cached
  .filter((entry) => refresh || featuresCache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pendingFeatures.length > 0) {
  console.log(dim(`  extracting WORLD features for ${pendingFeatures.length} clip${pendingFeatures.length === 1 ? '' : 's'}…`))
  const result = extractFeatures(pendingFeatures, { params: featuresCache.params, onProgress: progress('analysed', 50) })
  endProgress()
  Object.assign(featuresCache.clips, result.clips)
  for (const [id, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${id}: ${message}`)
  }
  saveFeaturesCache(featuresCache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_FEATURES_FILE}`))
} else {
  console.log(dim(`  WORLD features already cached for every clip (${AUDIO_FEATURES_FILE})`))
}

const references = buildAxisReferences(cached, mfccCache, featuresCache)
console.log(dim(`  ${references.length}/${cached.length} clips have both MFCC and WORLD features`))

function sortedByDistance(candidates: RankedCandidate[]): RankedCandidate[] {
  return [...candidates].sort((a, b) => a.distance - b.distance)
}

console.log(dim(`  ranking ${references.length} clips leave-one-out (unfiltered + gated)…`))
const onRank = progress('ranked', 200)
const toneCases: EvalCase[] = []
const rimeCases: EvalCase[] = []
const toneGatedCases: EvalCase[] = []
const rimeGatedCases: EvalCase[] = []
for (const [i, q] of references.entries()) {
  const others = references.filter((_, j) => j !== i)
  const target = parseSyllable(q.key)
  const query = { mfcc: q.mfcc, onsetMs: q.onsetMs, f0Contour: q.f0Contour }

  const unfiltered = computeAxisCandidates(query, others as AxisReferenceClip[])
  const gated = computeAxisCandidates(query, others as AxisReferenceClip[], { filters: targetAxisFilters(target, scheme) })

  toneCases.push({ truthKey: String(q.tone), candidates: sortedByDistance(unfiltered.tone) })
  rimeCases.push({ truthKey: rimeOf(target), candidates: sortedByDistance(unfiltered.rime) })
  toneGatedCases.push({ truthKey: String(q.tone), candidates: sortedByDistance(gated.tone) })
  rimeGatedCases.push({ truthKey: rimeOf(target), candidates: sortedByDistance(gated.rime) })

  onRank(i + 1, references.length)
}
endProgress()

console.log(`\n${formatAccuracy('tone — unfiltered leave-one-out', tallyAccuracy(toneCases))}`)
console.log(`\n${formatAccuracy('tone — gated to same-checkedness references', tallyAccuracy(toneGatedCases))}`)
console.log(`\n${formatAccuracy('rime — unfiltered leave-one-out', tallyAccuracy(rimeCases))}`)
console.log(`\n${formatAccuracy('rime — gated to same nasalisation+coda references', tallyAccuracy(rimeGatedCases))}`)

if (failures > 0) {
  console.log(red(`\n✗ ${failures} clip${failures === 1 ? '' : 's'} could not be fetched or analysed`))
  process.exit(1)
}
console.log(green('\n✓ eval complete'))
