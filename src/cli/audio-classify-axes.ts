import { classifyAxes } from '@teochew/core'
import { attestedTriples } from '../audio/attested-triples.js'
import { buildAxisReferences } from '../audio/axis-references.js'
import { checksumHex, clipCachePath, ensureClipCached, manifestClips, type ManifestClip } from '../audio/clip-cache.js'
import { DEFAULT_ANALYSIS_PARAMS, emptyFeaturesCache, extractFeatures, loadFeaturesCache, saveFeaturesCache, type FeatureTarget } from '../audio/features.js'
import { DEFAULT_MFCC_PARAMS, emptyMfccCache, extractMfcc, loadMfccCache, saveMfccCache, type MfccTarget } from '../audio/mfcc.js'
import { AUDIO_FEATURES_FILE, AUDIO_MFCC_FILE } from '../paths.js'
import { loadAudio } from '../phonology/load.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { bold, cyan, dim, red } from './colour.js'

/**
 * `npm run audio:classify-axes -- <path-to-clip> [--variety=chaozhou]
 * [--speaker=jky] [--top=5] [--refresh]` (issue #280)
 *
 * The axis-classifier counterpart to `npm run audio:classify` (#279): ranks
 * a clip by combining independent initial/rime DTW rankings and a tone
 * contour ranking, restricted to attested `(initial, rime, tone)` triples
 * (`classifyAxes`, `@teochew/core`) — see that issue for why. Prints the
 * combined ranking's confidence score alongside each match, plus each
 * candidate's own per-axis distance, so a wrong answer shows which axis
 * drove it.
 *
 * Network-touching and slower than `audio:classify` (DTW runs twice per
 * reference, once per segment, plus building the attested-triple table from
 * the whole dataset), so kept out of `npm run check` like every other
 * `audio:*` command.
 */

const USAGE = `usage:
  npm run audio:classify-axes -- <path-to-clip>                    rank against every jky/chaozhou reference
  npm run audio:classify-axes -- clip.webm --variety=shantou        a different variety
  npm run audio:classify-axes -- clip.webm --speaker=jky            a different reference speaker
  npm run audio:classify-axes -- clip.webm --top=10                 print more/fewer candidates (default 5)
  npm run audio:classify-axes -- clip.webm --refresh                re-extract MFCC/features for every reference`

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

ensureCacheSymlinkOrExit('classify-axes')

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

const mfccCache = (refresh ? null : loadMfccCache()) ?? emptyMfccCache(DEFAULT_MFCC_PARAMS)
const pendingMfcc: MfccTarget[] = cached
  .filter((entry) => refresh || mfccCache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pendingMfcc.length > 0) {
  console.log(dim(`  extracting MFCC for ${pendingMfcc.length} reference clip${pendingMfcc.length === 1 ? '' : 's'}…`))
  const result = extractMfcc(pendingMfcc, { params: mfccCache.params, onProgress: progress('analysed', 1) })
  endProgress()
  Object.assign(mfccCache.clips, result.clips)
  for (const [id, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${id}: ${message}`)
  }
  saveMfccCache(mfccCache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_MFCC_FILE}`))
} else {
  console.log(dim(`  MFCC already cached for every reference (${AUDIO_MFCC_FILE})`))
}

const featuresCache = (refresh ? null : loadFeaturesCache()) ?? emptyFeaturesCache(DEFAULT_ANALYSIS_PARAMS)
const pendingFeatures: FeatureTarget[] = cached
  .filter((entry) => refresh || featuresCache.clips[checksumHex(entry.clip.checksum)] === undefined)
  .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
if (pendingFeatures.length > 0) {
  console.log(dim(`  extracting WORLD features for ${pendingFeatures.length} reference clip${pendingFeatures.length === 1 ? '' : 's'}…`))
  const result = extractFeatures(pendingFeatures, { params: featuresCache.params, onProgress: progress('analysed', 1) })
  endProgress()
  Object.assign(featuresCache.clips, result.clips)
  for (const [id, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${id}: ${message}`)
  }
  saveFeaturesCache(featuresCache)
  console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_FEATURES_FILE}`))
} else {
  console.log(dim(`  WORLD features already cached for every reference (${AUDIO_FEATURES_FILE})`))
}

const references = buildAxisReferences(cached, mfccCache, featuresCache)
const attested = attestedTriples()
console.log(dim(`  ${references.length} references with both MFCC and features; ${attested.length} attested triples`))

const queryId = '__query__'
const [mfccResult, featuresResult] = [
  extractMfcc([{ id: queryId, webmPath: clipPath }], { params: mfccCache.params }),
  extractFeatures([{ id: queryId, webmPath: clipPath }], { params: featuresCache.params }),
]
if (mfccResult.errors[queryId] || featuresResult.errors[queryId]) {
  console.error(red(`could not analyse ${clipPath}: ${mfccResult.errors[queryId] ?? featuresResult.errors[queryId]}`))
  process.exit(1)
}
const query = {
  mfcc: mfccResult.clips[queryId]!.frames,
  onsetMs: featuresResult.clips[queryId]!.onsetMs,
  f0Contour: featuresResult.clips[queryId]!.f0.contour,
}

const ranked = classifyAxes(query, references, attested)

console.log(`\n  ${bold('closest matches (combined)')}`)
for (const [i, c] of ranked.slice(0, top).entries()) {
  console.log(
    `  ${String(i + 1).padStart(2)}. ${bold(cyan(c.syllable.padEnd(10)))} ` +
      `${dim(`dist ${c.distance.toFixed(3)}  score ${(c.score * 100).toFixed(1)}%`)}  ` +
      `${dim(`(initial=${c.initial || '∅'}, rime=${c.rime}, tone=${c.tone})`)}`,
  )
}

if (failures > 0) {
  console.log(red(`\n✗ ${failures} reference clip${failures === 1 ? '' : 's'} could not be fetched or analysed`))
  process.exit(1)
}
