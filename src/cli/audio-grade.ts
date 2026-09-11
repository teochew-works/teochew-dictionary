import { clipCachePath, ensureClipCached, manifestClips, type ManifestClip } from '../audio/clip-cache.js'
import {
  DEFAULT_ANALYSIS_PARAMS,
  emptyFeaturesCache,
  extractFeatures,
  loadFeaturesCache,
  saveFeaturesCache,
  type FeatureTarget,
} from '../audio/features.js'
import { checksumHex } from '../audio/clip-cache.js'
import { DEFAULT_OUTLIER_Z, gradeCorpus, toneCodaKey, type ClipGrade, type CorpusStats } from '../audio/grade.js'
import { AUDIO_CLIP_CACHE_DIR, AUDIO_FEATURES_FILE } from '../paths.js'
import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { bold, dim, green, red, yellow } from './colour.js'

/**
 * `npm run audio:grade -- [--variety=<id>] [--refresh] [--z=2.5] [--outliers=40]`
 * (issue #259)
 *
 * Caches every published clip locally, extracts per-clip features through
 * tools/resynth/, and prints the corpus's per-tone / per-coda / per-initial
 * statistics plus the clips furthest from them — the ones worth a listen,
 * and the targets `audio:synthesize` renders toward.
 *
 * Network-touching (it fills `.cache/audio-clips/`), so deliberately kept out
 * of `npm run check` like `audio:verify`. Incremental after the first run:
 * a cached clip is not re-fetched and a cached feature record is not
 * re-extracted; `--refresh` re-extracts everything (after changing the tool).
 */

const USAGE = `usage:
  npm run audio:grade                       every variety, fetch + extract only what's missing
  npm run audio:grade -- --variety=chaozhou one variety
  npm run audio:grade -- --refresh          re-extract features for every clip
  npm run audio:grade -- --z=2.0            flag clips at or beyond this many robust σ (default ${DEFAULT_OUTLIER_Z})
  npm run audio:grade -- --outliers=100     print at most this many flagged clips (default 40)`

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

const varietyFlag = args.find((a) => a.startsWith('--variety='))
const onlyVariety = varietyFlag ? varietyFlag.slice('--variety='.length) : undefined
const refresh = args.includes('--refresh')
const outlierZ = numberFlag('z', DEFAULT_OUTLIER_Z)
const maxOutliers = numberFlag('outliers', 40)

ensureCacheSymlinkOrExit('grade')

const varieties = listAudioVarieties().filter((id) => !onlyVariety || id === onlyVariety)
if (varieties.length === 0) {
  console.error(red(onlyVariety ? `no such audio variety: ${onlyVariety}` : 'no audio varieties found'))
  process.exit(1)
}

// A TTY can overwrite one progress line in place; a non-TTY (piped, CI) gets
// a line every `every` calls instead — per clip that's every 100th, per
// extraction batch (256 clips at a time) it's every one, or a whole run
// would print nothing until its last batch.
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

let failures = 0

for (const id of varieties) {
  const audio = loadAudio(id)
  const clips = manifestClips(audio)
  console.log(bold(`${id}: ${clips.length} clip${clips.length === 1 ? '' : 's'}`))

  // 1. Bytes. One fetch per clip ever, keyed by checksum.
  const cached: ManifestClip[] = []
  const onFetch = progress('cached', 100)
  let fetched = 0
  for (const [i, entry] of clips.entries()) {
    const result = await ensureClipCached(entry.clip)
    if (result.ok) {
      cached.push(entry)
      if (result.fetched) fetched += 1
    } else {
      failures += 1
      console.log(`\n  ${red('error')} ${entry.path}: ${result.error}`)
    }
    onFetch(i + 1, clips.length)
  }
  endProgress()
  console.log(dim(`  ${fetched} fetched, ${cached.length - fetched} already in ${AUDIO_CLIP_CACHE_DIR}`))

  // 2. Features. Extracted once per checksum unless --refresh.
  const cache = (refresh ? null : loadFeaturesCache()) ?? emptyFeaturesCache(DEFAULT_ANALYSIS_PARAMS)
  const pending: FeatureTarget[] = cached
    .filter((entry) => refresh || cache.clips[checksumHex(entry.clip.checksum)] === undefined)
    .map((entry) => ({ id: checksumHex(entry.clip.checksum), webmPath: clipCachePath(entry.clip.checksum) }))
  if (pending.length > 0) {
    console.log(dim(`  extracting features for ${pending.length} clip${pending.length === 1 ? '' : 's'}…`))
    const result = extractFeatures(pending, { params: cache.params, onProgress: progress('analysed', 1) })
    endProgress()
    Object.assign(cache.clips, result.clips)
    for (const [clipId, message] of Object.entries(result.errors)) {
      failures += 1
      console.log(`  ${red('error')} ${clipId}: ${message}`)
    }
    saveFeaturesCache(cache)
    console.log(dim(`  ${Object.keys(result.clips).length} extracted → ${AUDIO_FEATURES_FILE}`))
  } else {
    console.log(dim(`  features already cached for every clip (${AUDIO_FEATURES_FILE})`))
  }

  // 3. Grade.
  const inputs = cached.flatMap((entry) => {
    const clipId = checksumHex(entry.clip.checksum)
    const features = cache.clips[clipId]
    return features ? [{ key: entry.key, id: clipId, features }] : []
  })
  const grade = gradeCorpus(inputs, { outlierZ })
  printStats(grade.stats)
  printOutliers(grade.clips, maxOutliers)
}

if (failures > 0) {
  console.log(red(`\n✗ ${failures} clip${failures === 1 ? '' : 's'} could not be fetched or analysed`))
  process.exit(1)
}
console.log(green('\n✓ corpus graded'))

function fmt(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '–'
}

function printStats(stats: CorpusStats): void {
  console.log(`\n  ${bold('per tone')}  ${dim('(median ± robust σ)')}`)
  console.log(dim('  tone     n   f0 Hz          voiced ms       level dB'))
  for (const tone of Object.keys(stats.byTone).map(Number).sort((a, b) => a - b)) {
    const t = stats.byTone[tone]!
    const f0Hz = 100 * 2 ** (t.f0Semitones.median / 12)
    const f0Sigma = f0Hz * (2 ** (t.f0Semitones.sigma / 12) - 1)
    console.log(
      `  ${String(tone).padStart(4)} ${String(t.rmsDb.n).padStart(5)}   ` +
        `${fmt(f0Hz).padStart(4)} ± ${fmt(f0Sigma).padEnd(6)}   ` +
        `${fmt(t.voicedMs.median).padStart(4)} ± ${fmt(t.voicedMs.sigma).padEnd(6)}   ` +
        `${fmt(t.rmsDb.median, 1).padStart(6)} ± ${fmt(t.rmsDb.sigma, 1)}`,
    )
  }
  console.log(`  ${dim('corpus level')} ${fmt(stats.rmsDb.median, 1)} ± ${fmt(stats.rmsDb.sigma, 1)} dB`)

  console.log(`\n  ${bold('voiced ms per tone × coda class')}`)
  const codas = ['open', 'nasal', 'stop'] as const
  console.log(dim(`  tone  ${codas.map((c) => c.padStart(14)).join('')}`))
  for (const tone of Object.keys(stats.byTone).map(Number).sort((a, b) => a - b)) {
    const cells = codas.map((coda) => {
      const s = stats.byToneCoda[toneCodaKey(tone, coda)]?.voicedMs
      return s ? `${fmt(s.median)} ± ${fmt(s.sigma)} (${s.n})`.padStart(14) : '–'.padStart(14)
    })
    console.log(`  ${String(tone).padStart(4)}  ${cells.join('')}`)
  }

  const initials = Object.entries(stats.byInitial).sort(([a], [b]) => a.localeCompare(b))
  if (initials.length > 0) {
    console.log(`\n  ${bold('unvoiced onset ms per initial')}`)
    console.log(
      '  ' +
        initials.map(([initial, s]) => `${initial}: ${fmt(s.onsetMs.median)} ± ${fmt(s.onsetMs.sigma)} (${s.onsetMs.n})`).join('  '),
    )
  }
}

function printOutliers(clips: ClipGrade[], limit: number): void {
  const flagged = clips.filter((c) => c.flags.length > 0).sort((a, b) => b.maxZ - a.maxZ)
  console.log(`\n  ${bold('worth a listen')}  ${dim(`${flagged.length} flagged of ${clips.length}`)}`)
  for (const clip of flagged.slice(0, limit)) {
    console.log(`  ${yellow(clip.key.padEnd(10))} ${dim(clip.id.slice(0, 12))}  ${clip.flags.join('; ')}`)
  }
  if (flagged.length > limit) console.log(dim(`  … ${flagged.length - limit} more (--outliers=N)`))
}
