import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { checksumHex, clipCachePath, manifestClips, manifestRecordings } from '../audio/clip-cache.js'
import { loadFeaturesCache } from '../audio/features.js'
import {
  DEFAULT_HOLDOUT_FRACTION,
  DEFAULT_PAD_MS,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_TRAINING_Z,
  writeDataset,
  type DatasetClip,
} from '../audio/tts-dataset.js'
import { AUDIO_FEATURES_FILE, AUDIO_TTS_DIR } from '../paths.js'
import { syllablesToIpa } from '../phonology/ipa.js'
import { listAudioVarieties, loadAudio, loadPengimScheme, loadVariety } from '../phonology/load.js'
import { parseSyllable, type Syllable } from '../phonology/syllable.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { bold, dim, green, red, yellow } from './colour.js'

/**
 * `npm run tts:export -- [--variety=<id>] [--z=3] [--holdout=0.05]
 *  [--rate=22050] [--pad=50]` (issue #260)
 *
 * Writes the VITS training set for tools/tts/ into
 * `.cache/audio-tts/<variety>/`: one trimmed, padded WAV per recording
 * that `audio:grade` would not flag at `--z`, plus a `metadata.csv` /
 * `holdout.csv` / `phonemes.json` triple per token scheme (`pengim/`,
 * `ipa/`) and a `dataset.json` saying what was kept, dropped and held out.
 *
 * Offline: sources are the clip cache and the features cache that
 * `npm run audio:grade` fills. Training itself never runs from here — it is
 * a deliberate, hours-long, GPU-or-MPS step documented in tools/tts/README.md.
 */

const USAGE = `usage:
  npm run tts:export                         every variety with audio
  npm run tts:export -- --variety=chaozhou   one variety
  npm run tts:export -- --z=3                drop clips audio:grade flags at this many robust σ (default ${DEFAULT_TRAINING_Z})
  npm run tts:export -- --holdout=0.05       fraction of syllables kept out of training (default ${DEFAULT_HOLDOUT_FRACTION})
  npm run tts:export -- --rate=22050         WAV sample rate (default ${DEFAULT_SAMPLE_RATE}, Piper's medium quality)
  npm run tts:export -- --pad=50             ms of silence either side of each clip (default ${DEFAULT_PAD_MS})`

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

const onlyVariety = stringFlag('variety')
const z = numberFlag('z', DEFAULT_TRAINING_Z)
const holdout = numberFlag('holdout', DEFAULT_HOLDOUT_FRACTION)
const sampleRate = numberFlag('rate', DEFAULT_SAMPLE_RATE)
const padMs = numberFlag('pad', DEFAULT_PAD_MS)

ensureCacheSymlinkOrExit('export')

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
  ? (done: number, total: number) => process.stdout.write(`\r${dim(`${done}/${total} exported`)}`)
  : (done: number, total: number) => {
      if (done % 500 === 0 || done === total) console.log(dim(`${done}/${total} exported`))
    }

let failures = 0

for (const variety of varieties) {
  const audio = loadAudio(variety)
  const scheme = loadPengimScheme()
  const varietyTables = loadVariety(audio.audio.variety)
  const total = manifestClips(audio).length
  const entries = manifestRecordings(audio)
  console.log(bold(`${variety}: ${entries.length} recording${entries.length === 1 ? '' : 's'} of ${total} clips`))

  const clips: DatasetClip[] = []
  for (const entry of entries) {
    const id = checksumHex(entry.clip.checksum)
    const features = cache.clips[id]
    const webmPath = clipCachePath(entry.clip.checksum)
    let syllable: Syllable
    try {
      syllable = parseSyllable(entry.key, scheme)
    } catch {
      console.log(yellow(`  ${entry.path}: unparseable key, skipped`))
      continue
    }
    if (!features || !existsSync(webmPath)) {
      failures += 1
      console.log(`  ${red('error')} ${entry.path}: ${features ? 'not in the clip cache' : 'no cached features'} — run \`npm run audio:grade\``)
      continue
    }
    clips.push({ key: entry.key, id, webmPath, syllable, features })
  }

  const outDir = join(AUDIO_TTS_DIR, variety)
  console.log(dim(`  writing ${outDir}…`))
  const report = writeDataset(
    { variety, manifestClips: total, clips, ipa: (s) => syllablesToIpa([s], varietyTables, scheme).ipa },
    outDir,
    { z, holdout, sampleRate, padMs, onProgress },
  )
  if (isTTY) process.stdout.write('\n')

  const c = report.counts
  console.log(`  ${c.recordings} recordings of ${c.manifest} clips; ${c.kept} kept, ${c.dropped} dropped at ${z}σ`)
  console.log(`  ${c.train} train / ${c.holdout} held-out syllables${c.holdout > 0 ? ` (${report.holdout.slice(0, 12).join(', ')}${report.holdout.length > 12 ? ', …' : ''})` : ''}`)
  for (const [name, s] of Object.entries(report.schemes)) console.log(`  ${name}: ${s.symbols} symbols → ${join(outDir, name)}`)
  if (report.dropped.length > 0) {
    console.log(`\n  ${bold('dropped')}`)
    for (const d of report.dropped.slice(0, 20)) console.log(`  ${yellow(d.key.padEnd(10))} ${dim(d.id.slice(0, 12))}  ${d.reason}`)
    if (report.dropped.length > 20) console.log(dim(`  … ${report.dropped.length - 20} more in dataset.json`))
  }
}

if (failures > 0) {
  console.log(red(`\n✗ ${failures} clip${failures === 1 ? '' : 's'} could not be exported`))
  process.exit(1)
}
console.log(green('\n✓ exported'))
