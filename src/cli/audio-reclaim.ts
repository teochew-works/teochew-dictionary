import { listAudioVarieties, loadAudio } from '../phonology/load.js'
import { collectReferencedKeys, reclaimAudioAssets } from '../importers/audio-reclaim.js'
import { AUDIO_BUCKET, AUDIO_CLIP_PREFIX } from '../importers/s3-upload.js'
import { dim, green } from './colour.js'

/**
 * `npm run audio:reclaim -- [--write]`
 *
 * Reports S3 objects under the bucket's `teochew/clips/` prefix that no
 * variety's manifest references any more — superseded re-recordings, or a
 * leftover from an aborted upload (issue #241/#270). Reads every variety's
 * manifest as one combined set of referenced keys before diffing anything,
 * so an asset stranded for one variety can never be mistaken for stranded
 * when another variety still cites it.
 *
 * Dry-run by default (ADR-0018); `--write` deletes the stranded objects.
 * Network-touching and destructive, so deliberately excluded from
 * `npm run check`, same as `audio:verify`.
 */

const write = process.argv.slice(2).includes('--write')

const audios = listAudioVarieties().map((id) => loadAudio(id))
const referencedKeys = collectReferencedKeys(audios)

const result = await reclaimAudioAssets(referencedKeys, { write })

for (const s of result.stranded) {
  const marker = write ? green('✓ deleted') : dim('would delete')
  console.log(`  ${marker} ${s.key}`)
}

console.log(
  `\n${result.objectsScanned} object(s) scanned under s3://${AUDIO_BUCKET}/${AUDIO_CLIP_PREFIX}, ` +
    `${result.stranded.length} stranded, ${result.deleted.length} ${write ? 'deleted' : 'would delete'}`,
)
if (!write) console.log(dim('dry run — pass --write to delete stranded objects'))
