import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { checksumHex, clipCachePath, manifestRecordings } from '../audio/clip-cache.js'
import { loadFeaturesCache, type ClipFeatures } from '../audio/features.js'
import { computeCorpusStats, type CorpusStats } from '../audio/grade.js'
import { synthesizeClips, type RenderedClip, type SynthJobClip } from '../audio/synthesize.js'
import { DEFAULT_RENDER_CHECK_Z, checkRender, composeTarget, type RenderCheck, type SynthTarget } from '../audio/targets.js'
import { AUDIO_FEATURES_FILE, AUDIO_SYNTH_DIR } from '../paths.js'
import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { parseSyllable, type Syllable } from '../phonology/syllable.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { bold, dim, green, red, yellow } from './colour.js'

/**
 * `npm run audio:synthesize -- [--write] [--variety=<id>] [--only=<key,…>]
 *  [--z=1.5] [--f0-blend=1] [--pad=50]` (issue #259)
 *
 * Re-renders every clip toward a target composed from its Peng'im parts'
 * corpus statistics — the tone's median f0 contour, the tone × coda
 * duration, the initial's unvoiced onset, the corpus level — keeping the
 * clip's own spectral envelope, so the result is the same speaker saying the
 * same syllable, consistently. Output is a normalised *tier*, never a
 * replacement: it goes under `.cache/audio-synth/<variety>/`, and publishing
 * it as its own speaker id is a separate, human step.
 *
 * Offline: sources are the clip cache and the features cache that
 * `npm run audio:grade` fills. Dry-run by default, which prints what each
 * clip would be rendered toward; `--write` renders and then self-checks
 * every output against the same yardsticks (a render further than `--z`
 * robust σ from its groups is reported as a failure, not published).
 */

const USAGE = `usage:
  npm run audio:synthesize                          dry run: print targets for every clip
  npm run audio:synthesize -- --only=du2,dua7       just these syllables
  npm run audio:synthesize -- --write               render into .cache/audio-synth/<variety>/ and self-check
  npm run audio:synthesize -- --variety=chaozhou    one variety
  npm run audio:synthesize -- --z=2                 self-check tolerance in robust σ (default ${DEFAULT_RENDER_CHECK_Z})
  npm run audio:synthesize -- --f0-blend=0.8        keep some of each clip's own contour (default 1 = template)
  npm run audio:synthesize -- --pad=50              ms of silence either side of the render (default 50)`

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE)
  process.exit(0)
}

function stringFlag(name: string): string | undefined {
  const flag = args.find((a) => a.startsWith(`--${name}=`))
  return flag?.slice(name.length + 3)
}

function numberFlag(name: string, fallback: number): number {
  const raw = stringFlag(name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    console.error(`--${name}=${raw}: expected a non-negative number\n\n${USAGE}`)
    process.exit(2)
  }
  return value
}

const write = args.includes('--write')
const onlyVariety = stringFlag('variety')
const only = stringFlag('only')?.split(',').map((k) => k.trim()).filter(Boolean)
const selfCheckZ = numberFlag('z', DEFAULT_RENDER_CHECK_Z)
const f0Blend = numberFlag('f0-blend', 1)
const padMs = numberFlag('pad', 50)

ensureCacheSymlinkOrExit('synthesize')

const varieties = listAudioVarieties().filter((id) => !onlyVariety || id === onlyVariety)
if (varieties.length === 0) {
  console.error(red(onlyVariety ? `no such audio variety: ${onlyVariety}` : 'no audio varieties found'))
  process.exit(1)
}

const cache = loadFeaturesCache()
if (cache === null) {
  console.error(red(`no features cache at ${AUDIO_FEATURES_FILE} — run \`npm run audio:grade\` first`))
  process.exit(1)
}

const isTTY = process.stdout.isTTY
const onProgress = isTTY
  ? (done: number, total: number) => process.stdout.write(`\r${dim(`${done}/${total} rendered`)}`)
  : (done: number, total: number) => console.log(dim(`${done}/${total} rendered`))

let failures = 0

for (const variety of varieties) {
  const audio = loadAudio(variety)
  // Recordings only: a published render (ADR-0027) is neither a source nor a yardstick.
  const clips = manifestRecordings(audio)
  console.log(bold(`${variety}: ${clips.length} recording${clips.length === 1 ? '' : 's'}`))

  // Yardsticks come from the whole corpus, whatever --only selects.
  const withFeatures = clips.flatMap((entry) => {
    const features = cache.clips[checksumHex(entry.clip.checksum)]
    const syllable = tryParse(entry.key)
    return features && syllable ? [{ entry, syllable, features }] : []
  })
  if (withFeatures.length < clips.length) {
    console.log(yellow(`  ${clips.length - withFeatures.length} clip(s) have no cached features or an unparseable key — run \`npm run audio:grade\``))
  }
  const stats = computeCorpusStats(withFeatures.map(({ syllable, features }) => ({ syllable, features })))

  const selected = only ? withFeatures.filter(({ entry }) => only.includes(entry.key)) : withFeatures
  if (only) {
    for (const key of only) if (!selected.some(({ entry }) => entry.key === key)) console.log(yellow(`  ${key}: not in ${variety} (or no features)`))
  }

  const jobs: SynthJobClip[] = []
  const previews: { key: string; features: ClipFeatures; target: SynthTarget }[] = []
  const syllables = new Map<string, Syllable>()
  for (const { entry, syllable, features } of selected) {
    syllables.set(entry.key, syllable)
    const target = composeTarget(stats, syllable, { f0Blend, padMs })
    if (target === null) {
      failures += 1
      console.log(`  ${red('error')} ${entry.path}: no corpus yardstick for tone ${syllable.tone}`)
      continue
    }
    const webmPath = clipCachePath(entry.clip.checksum)
    if (!existsSync(webmPath)) {
      failures += 1
      console.log(`  ${red('error')} ${entry.path}: not in the clip cache — run \`npm run audio:grade\``)
      continue
    }
    jobs.push({ key: entry.key, id: checksumHex(entry.clip.checksum), webmPath, target })
    previews.push({ key: entry.key, features, target })
  }

  if (!write) {
    printPreviews(previews, only ? previews.length : 20)
    console.log(dim(`\n  ${jobs.length} clip(s) would be rendered into ${join(AUDIO_SYNTH_DIR, variety)}`))
    console.log(dim('  dry run — pass --write to render'))
    continue
  }

  const outDir = join(AUDIO_SYNTH_DIR, variety)
  console.log(dim(`  rendering ${jobs.length} clip(s) into ${outDir}…`))
  const result = synthesizeClips(jobs, outDir, { params: cache.params, onProgress })
  if (isTTY) process.stdout.write('\n')

  for (const [key, message] of Object.entries(result.errors)) {
    failures += 1
    console.log(`  ${red('error')} ${key}: ${message}`)
  }

  const targets = new Map(jobs.map((job) => [job.key, job.target]))
  const checks = new Map(
    Object.values(result.rendered).map((clip) => [
      clip.key,
      checkRender(stats, syllables.get(clip.key)!, targets.get(clip.key)!, clip.info, clip.features, selfCheckZ),
    ]),
  )
  const report = {
    version: 1,
    generated: new Date().toISOString(),
    variety,
    params: cache.params,
    selfCheckZ,
    f0Blend,
    padMs,
    clips: Object.fromEntries(
      Object.values(result.rendered).map((clip) => [
        clip.key,
        { id: clip.id, wavPath: clip.wavPath, info: clip.info, features: clip.features, check: checks.get(clip.key) },
      ]),
    ),
    errors: result.errors,
  }
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))

  printSelfCheck(checks, selfCheckZ)
  console.log(dim(`  report → ${join(outDir, 'report.json')}`))
}

if (failures > 0) {
  console.log(red(`\n✗ ${failures} clip${failures === 1 ? '' : 's'} could not be rendered`))
  process.exit(1)
}
console.log(green(write ? '\n✓ rendered' : '\n✓ dry run complete'))

function tryParse(key: string): Syllable | null {
  try {
    return parseSyllable(key)
  } catch {
    return null
  }
}

function fmt(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '–' : value.toFixed(digits)
}

function contourSummary(contour: number[] | null): string {
  if (!contour || contour.length === 0) return '–'
  const mid = contour[Math.floor(contour.length / 2)]!
  return `${fmt(contour[0])}→${fmt(mid)}→${fmt(contour[contour.length - 1])} Hz`
}

function printPreviews(previews: { key: string; features: ClipFeatures; target: SynthTarget }[], limit: number): void {
  console.log(`\n  ${dim('key         source (f0 contour · voiced · onset · level)  →  target')}`)
  for (const { key, features, target } of previews.slice(0, limit)) {
    const src = `${contourSummary(features.f0.contour)} · ${fmt(features.voicedMs)} ms · ${fmt(features.onsetMs)} ms · ${fmt(features.rmsDb, 1)} dB`
    const dst = `${contourSummary(target.contourHz)} · ${fmt(target.voicedMs)} ms · ${target.onsetMs === null ? 'keep' : `${fmt(target.onsetMs)} ms`} · ${fmt(target.rmsDb, 1)} dB`
    console.log(`  ${yellow(key.padEnd(10))} ${src}\n  ${''.padEnd(10)} ${dim('→')} ${dst}`)
  }
  if (previews.length > limit) console.log(dim(`  … ${previews.length - limit} more (use --only=<key,…> to see specific syllables)`))
}

function printSelfCheck(checks: Map<string, RenderCheck>, z: number): void {
  const failed = [...checks.entries()].filter(([, c]) => !c.pass).sort(([, a], [, b]) => b.maxZ - a.maxZ)
  const passed = checks.size - failed.length
  console.log(`\n  ${bold('self-check')}  ${dim(`${passed}/${checks.size} landed within ${z}σ of their targets`)}`)
  for (const [key, check] of failed.slice(0, 20)) console.log(`  ${yellow(key.padEnd(10))} ${check.flags.join('; ')}`)
  if (failed.length > 20) console.log(dim(`  … ${failed.length - 20} more in report.json`))
}
