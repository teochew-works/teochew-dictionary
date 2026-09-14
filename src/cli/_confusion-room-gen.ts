import { computeAxisCandidates, type AxisReferenceClip } from '@teochew/core'
import { buildAxisReferences, type KeyedAxisReferenceClip } from '../audio/axis-references.js'
import { checksumHex, clipCachePath, ensureClipCached, manifestClips, type ManifestClip } from '../audio/clip-cache.js'
import {
  DEFAULT_ANALYSIS_PARAMS,
  emptyFeaturesCache,
  extractFeatures,
  loadFeaturesCache,
  saveFeaturesCache,
  type FeatureTarget,
} from '../audio/features.js'
import { DEFAULT_MFCC_PARAMS, emptyMfccCache, extractMfcc, loadMfccCache, saveMfccCache, type MfccTarget } from '../audio/mfcc.js'
import { buildAttestationCounts } from '../phonology/inventory.js'
import { loadEntries } from '../data/load.js'
import { loadAudio } from '../phonology/load.js'
import { ensureCacheSymlinkOrExit } from './cache-symlink.js'
import { dim } from './colour.js'
import { writeFileSync } from 'node:fs'

/**
 * Ad hoc regeneration of the "Confusion Listening Room" artifact's data
 * (issue #280 diagnostics) after the bi2/bag8/dai5/zing6 jky re-record
 * (#283). Not a permanent CLI — mirrors issue #280's own "ad hoc,
 * uncommitted script" precedent for this kind of one-off analysis.
 *
 * Leave-one-out: every jky clip ranked against the *other* 3,087, per axis
 * (initial/rime/tone), via the same computeAxisCandidates() the shipped
 * classifier uses. For each query: rank = 0-based position of the true
 * label among candidates sorted by distance ascending (null if the true
 * label has no other representative once the query itself is excluded —
 * happens for singleton rimes); truthDist/bestDist/margin follow
 * computeAxisCandidates's own distances verbatim, including Infinity for a
 * failed segmentation (JSON.stringify collapses Infinity/NaN to null,
 * exactly matching the original artifact's data shape).
 */

ensureCacheSymlinkOrExit('confusion-room-gen')

const audio = loadAudio('chaozhou')
const refs = manifestClips(audio).filter((m) => m.clip.speaker === 'jky')
console.log(`${refs.length} jky clips`)

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
for (const [i, entry] of refs.entries()) {
  const result = await ensureClipCached(entry.clip)
  if (result.ok) cached.push(entry)
  else console.log(`\n  error ${entry.path}: ${result.error}`)
  onFetch(i + 1, refs.length)
}
endProgress()

const mfccCache = loadMfccCache() ?? emptyMfccCache(DEFAULT_MFCC_PARAMS)
const pendingMfcc: MfccTarget[] = cached
  .filter((e) => mfccCache.clips[checksumHex(e.clip.checksum)] === undefined)
  .map((e) => ({ id: checksumHex(e.clip.checksum), webmPath: clipCachePath(e.clip.checksum) }))
if (pendingMfcc.length > 0) {
  console.log(dim(`  extracting MFCC for ${pendingMfcc.length} clips…`))
  const result = extractMfcc(pendingMfcc, { params: mfccCache.params, onProgress: progress('analysed', 50) })
  endProgress()
  Object.assign(mfccCache.clips, result.clips)
  saveMfccCache(mfccCache)
} else {
  console.log(dim('  MFCC already cached for every clip'))
}

const featuresCache = loadFeaturesCache() ?? emptyFeaturesCache(DEFAULT_ANALYSIS_PARAMS)
const pendingFeatures: FeatureTarget[] = cached
  .filter((e) => featuresCache.clips[checksumHex(e.clip.checksum)] === undefined)
  .map((e) => ({ id: checksumHex(e.clip.checksum), webmPath: clipCachePath(e.clip.checksum) }))
if (pendingFeatures.length > 0) {
  console.log(dim(`  extracting WORLD features for ${pendingFeatures.length} clips…`))
  const result = extractFeatures(pendingFeatures, { params: featuresCache.params, onProgress: progress('analysed', 50) })
  endProgress()
  Object.assign(featuresCache.clips, result.clips)
  saveFeaturesCache(featuresCache)
} else {
  console.log(dim('  WORLD features already cached for every clip'))
}

const references: (KeyedAxisReferenceClip & { url: string })[] = buildAxisReferences(cached, mfccCache, featuresCache).map(
  (r, i) => ({ ...r, url: cached[i]!.clip.url }),
)
console.log(`${references.length} references with both MFCC and features`)

// Occurrence counts (chaozhou citation form), for picking "highest-occurrence"
// example clips per axis value in each card's reference list.
const citationCounts = buildAttestationCounts(loadEntries())
function occurrenceOf(pengim: string): number {
  return citationCounts.get(pengim)?.get('chaozhou') ?? 0
}

type AxisName = 'initial' | 'rime' | 'tone'
const AXES: AxisName[] = ['initial', 'rime', 'tone']

interface Row {
  axis: AxisName
  query: string
  queryUrl: string
  truth: string
  guessed: string | null
  rank: number | null
  total: number
  truthDist: number | null
  bestDist: number | null
  margin: number | null
  refs: { pengim: string; url: string }[]
}

const allRows: Record<AxisName, Row[]> = { initial: [], rime: [], tone: [] }
const confusionCounts: Record<AxisName, Map<string, number>> = {
  initial: new Map(),
  rime: new Map(),
  tone: new Map(),
}
const hits = { initial: { top1: 0, top3: 0, top5: 0, n: 0 }, rime: { top1: 0, top3: 0, top5: 0, n: 0 }, tone: { top1: 0, top3: 0, top5: 0, n: 0 } }

const onRank = progress('leave-one-out ranked', 100)
for (const [i, query] of references.entries()) {
  const others = references.filter((_, j) => j !== i)
  const candidates = computeAxisCandidates(
    { mfcc: query.mfcc, onsetMs: query.onsetMs, f0Contour: query.f0Contour },
    others as AxisReferenceClip[],
  )

  for (const axis of AXES) {
    const truth = axis === 'tone' ? String(query.tone) : axis === 'initial' ? query.initial : query.rime
    const sorted = [...candidates[axis]].sort((a, b) => a.distance - b.distance)
    const total = sorted.length
    const bestDist = sorted[0]?.distance ?? null
    const guessed = sorted[0]?.key ?? null

    const idx = sorted.findIndex((c) => c.key === truth)
    let rank: number | null = null
    let truthDist: number | null = null
    let margin: number | null = null
    if (idx !== -1) {
      rank = idx
      truthDist = sorted[idx]!.distance
      margin = truthDist - (bestDist as number)
    }

    hits[axis].n += 1
    if (rank !== null && rank < 1) hits[axis].top1 += 1
    if (rank !== null && rank < 3) hits[axis].top3 += 1
    if (rank !== null && rank < 5) hits[axis].top5 += 1

    if (guessed !== null && guessed !== truth) {
      const key = `${truth}→${guessed}`
      confusionCounts[axis].set(key, (confusionCounts[axis].get(key) ?? 0) + 1)
    }

    const exampleRefs = others
      .filter((o) => (axis === 'tone' ? String(o.tone) : axis === 'initial' ? o.initial : o.rime) === truth)
      .map((o) => ({ pengim: o.key, url: o.url, occ: occurrenceOf(o.key) }))
      .sort((a, b) => b.occ - a.occ)
      .slice(0, 3)
      .map(({ pengim, url }) => ({ pengim, url }))

    allRows[axis].push({
      axis,
      query: query.key,
      queryUrl: query.url,
      truth,
      guessed,
      rank,
      total,
      truthDist,
      bestDist,
      margin,
      refs: exampleRefs,
    })
  }

  onRank(i + 1, references.length)
}
endProgress()

function worstSortKey(r: Row): number {
  if (r.rank === null) return Infinity
  return r.rank / Math.max(r.total - 1, 1)
}

const OUTLIERS: Row[] = AXES.flatMap((axis) => {
  const rows = [...allRows[axis]]
  rows.sort((a, b) => {
    const ka = worstSortKey(a)
    const kb = worstSortKey(b)
    if (ka !== kb) return kb - ka
    return (b.margin ?? 0) - (a.margin ?? 0)
  })
  return rows.slice(0, 20)
})

const STATS = AXES.map((axis) => {
  const h = hits[axis]
  const label = axis === 'initial' ? 'Initial axis' : axis === 'rime' ? 'Rime axis' : 'Tone axis'
  const distinctValues = new Set(references.map((r) => (axis === 'tone' ? String(r.tone) : axis === 'initial' ? r.initial : r.rime)))
  const n =
    axis === 'initial'
      ? `${distinctValues.size} possible initials`
      : axis === 'rime'
        ? `~${distinctValues.size} possible rimes`
        : `${distinctValues.size} possible tones`
  return {
    axis,
    label,
    n,
    top1: (100 * h.top1) / h.n,
    top3: (100 * h.top3) / h.n,
    top5: (100 * h.top5) / h.n,
  }
})

const CONFUSIONS = Object.fromEntries(
  AXES.map((axis) => [
    axis,
    [...confusionCounts[axis].entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([pair, n]) => [pair, n]),
  ]),
)

writeFileSync(
  '/tmp/confusion-room-data.json',
  JSON.stringify({ OUTLIERS, STATS, CONFUSIONS }, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v)),
)
console.log('\nwrote /tmp/confusion-room-data.json')
console.log(STATS)
