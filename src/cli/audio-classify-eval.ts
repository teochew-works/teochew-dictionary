import { computeAxisCandidates, combineAxes, dtwDistance, rimeOf, type RankedCandidate } from '@teochew/core'
import { attestedTriples } from '../audio/attested-triples.js'
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
import { AUDIO_FEATURES_FILE, AUDIO_MFCC_FILE } from '../paths.js'
import { loadAudio } from '../phonology/load.js'
import { parseSyllable } from '../phonology/syllable.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { bold, dim, green, red } from './colour.js'

/**
 * `npm run audio:classify-eval -- [--variety=chaozhou] [--reference-speaker=jky]
 * [--query-speaker=jky-n] [--refresh]` (issue #280)
 *
 * Held-out accuracy for both #279's whole-syllable DTW/MFCC classifier and
 * #280's initial/rime/tone axis classifier, side by side: every
 * `query-speaker` clip (by default the `jky-n` WORLD-retuned resynthesis
 * tier, ADR-0027 — a genuine re-rendering, not a byte-copy) ranked against
 * every `reference-speaker` clip, tallied into top-1/3/5. The whole-syllable
 * number is the baseline the axis classifier is measured against — this is
 * the go/no-go checkpoint #280 calls for: if the combined number doesn't
 * clearly beat it, that's a real finding to report, not to hide.
 *
 * Network-touching and slow (the axis classifier runs DTW twice per
 * reference, once per segment, on top of the whole-syllable baseline's one),
 * so kept out of `npm run check` like every other `audio:*` command.
 * Incremental: both reference and query clips are real corpus clips with
 * stable checksums, so their MFCC/features are cached and re-extracted only
 * for new/changed clips, not on every eval run.
 */

const USAGE = `usage:
  npm run audio:classify-eval                                        jky-n queries vs jky references, chaozhou
  npm run audio:classify-eval -- --variety=shantou                    a different variety
  npm run audio:classify-eval -- --reference-speaker=jky --query-speaker=jky-n
  npm run audio:classify-eval -- --refresh                            re-extract MFCC/features for every clip`

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
const mfccCache = (refresh ? null : loadMfccCache()) ?? emptyMfccCache(DEFAULT_MFCC_PARAMS)
const pendingMfcc: MfccTarget[] = cached
  .filter((entry) => refresh || mfccCache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pendingMfcc.length > 0) {
  console.log(dim(`  extracting MFCC for ${pendingMfcc.length} clip${pendingMfcc.length === 1 ? '' : 's'}…`))
  const result = extractMfcc(pendingMfcc, { params: mfccCache.params, onProgress: progress('analysed', 50) })
  endProgress()
  Object.assign(mfccCache.clips, result.clips)
  for (const [clipId, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${clipId}: ${message}`)
  }
  saveMfccCache(mfccCache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_MFCC_FILE}`))
} else {
  console.log(dim(`  MFCC already cached for every clip (${AUDIO_MFCC_FILE})`))
}

// 2b. WORLD features for both sets — the axis classifier's onsetMs/f0.contour.
const featuresCache = (refresh ? null : loadFeaturesCache()) ?? emptyFeaturesCache(DEFAULT_ANALYSIS_PARAMS)
const pendingFeatures: FeatureTarget[] = cached
  .filter((entry) => refresh || featuresCache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pendingFeatures.length > 0) {
  console.log(dim(`  extracting WORLD features for ${pendingFeatures.length} clip${pendingFeatures.length === 1 ? '' : 's'}…`))
  const result = extractFeatures(pendingFeatures, { params: featuresCache.params, onProgress: progress('analysed', 50) })
  endProgress()
  Object.assign(featuresCache.clips, result.clips)
  for (const [clipId, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${clipId}: ${message}`)
  }
  saveFeaturesCache(featuresCache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_FEATURES_FILE}`))
} else {
  console.log(dim(`  WORLD features already cached for every clip (${AUDIO_FEATURES_FILE})`))
}

const cachedRefs = refs.filter((r) => cached.includes(r) && mfccCache.clips[checksumHex(r.clip.checksum)])
const cachedQueries = queries.filter((q) => cached.includes(q) && mfccCache.clips[checksumHex(q.clip.checksum)])

// 3. Baseline: whole-syllable DTW/MFCC ranking (#279).
console.log(dim(`  ranking ${cachedQueries.length} queries against ${cachedRefs.length} references (whole-syllable)…`))
const onBaselineRank = progress('ranked', 100)
const baselineCases: EvalCase[] = cachedQueries.map((query, i) => {
  const queryFrames = mfccCache.clips[checksumHex(query.clip.checksum)]!.frames
  const candidates = cachedRefs.map((ref) => ({
    key: ref.key,
    distance: dtwDistance(queryFrames, mfccCache.clips[checksumHex(ref.clip.checksum)]!.frames),
  }))
  candidates.sort((a, b) => a.distance - b.distance)
  onBaselineRank(i + 1, cachedQueries.length)
  return { truthKey: query.key, candidates }
})
endProgress()

// 4. Axis classifier: initial/rime DTW + tone contour, combined against
// attested (initial, rime, tone) triples (#280).
const axisReferences = buildAxisReferences(cachedRefs, mfccCache, featuresCache)
const attested = attestedTriples()
console.log(
  dim(
    `  ${axisReferences.length}/${cachedRefs.length} references have WORLD features; ${attested.length} attested triples in the lexicon`,
  ),
)

function sortedByDistance(candidates: RankedCandidate[]): RankedCandidate[] {
  return [...candidates].sort((a, b) => a.distance - b.distance)
}

console.log(dim(`  ranking ${cachedQueries.length} queries against ${axisReferences.length} references (axes)…`))
const onAxisRank = progress('ranked', 100)
const combinedCases: EvalCase[] = []
const initialCases: EvalCase[] = []
const rimeCases: EvalCase[] = []
const toneCases: EvalCase[] = []
let skippedNoFeatures = 0
for (const [i, query] of cachedQueries.entries()) {
  const checksum = checksumHex(query.clip.checksum)
  const mfcc = mfccCache.clips[checksum]?.frames
  const features = featuresCache.clips[checksum]
  onAxisRank(i + 1, cachedQueries.length)
  if (!mfcc || !features) {
    skippedNoFeatures += 1
    continue
  }
  const truth = parseSyllable(query.key)
  const axes = computeAxisCandidates(
    { mfcc, onsetMs: features.onsetMs, f0Contour: features.f0.contour },
    axisReferences,
  )
  const combined = combineAxes(attested, axes)

  combinedCases.push({ truthKey: query.key, candidates: combined.map((c) => ({ key: c.syllable, distance: c.distance })) })
  initialCases.push({ truthKey: truth.initial ?? '', candidates: sortedByDistance(axes.initial) })
  rimeCases.push({ truthKey: rimeOf(truth), candidates: sortedByDistance(axes.rime) })
  toneCases.push({ truthKey: String(truth.tone), candidates: sortedByDistance(axes.tone) })
}
endProgress()
if (skippedNoFeatures > 0) {
  console.log(dim(`  ${skippedNoFeatures} quer${skippedNoFeatures === 1 ? 'y' : 'ies'} skipped (no cached MFCC/features)`))
}

console.log(`\n${formatAccuracy(`whole-syllable DTW/MFCC baseline (${querySpeaker} vs ${referenceSpeaker})`, tallyAccuracy(baselineCases))}`)
console.log(`\n${formatAccuracy('axis classifier — combined (initial+rime+tone)', tallyAccuracy(combinedCases))}`)
console.log(`\n${formatAccuracy('axis classifier — initial only', tallyAccuracy(initialCases))}`)
console.log(`\n${formatAccuracy('axis classifier — rime only', tallyAccuracy(rimeCases))}`)
console.log(`\n${formatAccuracy('axis classifier — tone only', tallyAccuracy(toneCases))}`)

if (failures > 0) {
  console.log(red(`\n✗ ${failures} clip${failures === 1 ? '' : 's'} could not be fetched or analysed`))
  process.exit(1)
}
console.log(green('\n✓ eval complete'))
