import { describe, expect, it } from 'vitest'

import type { Audio } from '@teochew/core'
import { collectReferencedKeys, reclaimAudioAssets, type BucketObject } from '../src/importers/audio-reclaim.js'
import { audioAssetPathForClip, audioClipKey, AUDIO_CDN_BASE } from '../src/importers/s3-upload.js'

function audioTable(id: string, clips: Audio['clips'], wordClips?: Audio['wordClips']): Audio {
  return { audio: { id, variety: id }, clips, wordClips }
}

const clip = (overrides: Partial<Audio['clips'][string][number]> = {}) => ({
  url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-1/a1.webm',
  confidence: 'high' as const,
  sources: ['fixture'],
  checksum: `sha256:${'a'.repeat(64)}`,
  ...overrides,
})

/**
 * The S3 key `mirrorAudioToS3`/`rehostClip` derive for a clip at `key` —
 * the same derivation `collectReferencedKeys`/`reclaimAudioAssets` are
 * tested against, so a fixture's expected key can never drift from what
 * production code actually computes.
 */
function s3Key(key: string, speaker: string | undefined, ext: string): string {
  return audioClipKey(audioAssetPathForClip(key, speaker, ext))
}

function objectAt(key: string): BucketObject {
  return { key, url: `${AUDIO_CDN_BASE}/${key}` }
}

/** Fake S3 hooks recording every call into an array — no real AWS call ever runs. */
function fakeBucket(objects: BucketObject[]) {
  const deleteCalls: string[] = []
  return {
    listObjects: async () => objects,
    deleteObject: async (key: string) => {
      deleteCalls.push(key)
    },
    deleteCalls,
  }
}

describe('reclaimAudioAssets', () => {
  it('leaves a referenced object alone', async () => {
    const key = s3Key('a1', undefined, '.webm')
    const referenced = new Set([key])
    const bucket = fakeBucket([objectAt(key)])

    const result = await reclaimAudioAssets(referenced, bucket)

    expect(result.stranded).toEqual([])
    expect(result.objectsScanned).toBe(1)
  })

  it('reports an unreferenced object as stranded but does not delete it without --write', async () => {
    const key = s3Key('a1', undefined, '.webm')
    const referenced = new Set<string>()
    const bucket = fakeBucket([objectAt(key)])

    const result = await reclaimAudioAssets(referenced, bucket)

    expect(result.stranded).toEqual([objectAt(key)])
    expect(result.deleted).toEqual([])
    expect(bucket.deleteCalls).toEqual([])
  })

  it('--write deletes every stranded object and only those', async () => {
    const liveKey = s3Key('live', undefined, '.webm')
    const staleKey = s3Key('stale', undefined, '.webm')
    const referenced = new Set([liveKey])
    const bucket = fakeBucket([objectAt(liveKey), objectAt(staleKey)])

    const result = await reclaimAudioAssets(referenced, { write: true, ...bucket })

    expect(result.deleted).toEqual([objectAt(staleKey)])
    expect(bucket.deleteCalls).toEqual([staleKey])
  })
})

describe('collectReferencedKeys', () => {
  it('picks up url and cafUrl from both clips and wordClips', () => {
    const audio = audioTable(
      'chaozhou',
      {
        a1: [
          clip({
            cafUrl: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-1/a1.caf',
            cafChecksum: `sha256:${'b'.repeat(64)}`,
          }),
        ],
      },
      { 'a1 b2': [clip()] },
    )

    const keys = collectReferencedKeys([audio])

    expect(keys).toEqual(
      new Set([s3Key('a1', undefined, '.webm'), s3Key('a1', undefined, '.caf'), s3Key('a1 b2', undefined, '.webm')]),
    )
  })

  it('derives the same key whether the manifest still points at GitHub or has already been rewritten to CloudFront (issue #270 migration window)', () => {
    const key = s3Key('a1', 'jky', '.webm')
    const preMigration = audioTable('chaozhou', {
      a1: [clip({ speaker: 'jky', url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-1/a1.webm' })],
    })
    const postMigration = audioTable('chaozhou', {
      a1: [clip({ speaker: 'jky', url: `${AUDIO_CDN_BASE}/${key}` })],
    })

    // `audio-mirror-to-s3 --write` uploads an object to `key` without
    // touching the manifest (a separate, later step) — a reclaim run in
    // that window must not treat the freshly-mirrored object, still cited
    // by a GitHub url, as stranded.
    expect(collectReferencedKeys([preMigration])).toEqual(new Set([key]))
    expect(collectReferencedKeys([postMigration])).toEqual(new Set([key]))
  })

  it('combines every variety at once — cross-variety safety (issue #241)', async () => {
    const chaozhouKey = s3Key('a1', 'jky', '.webm')
    const shantouKey = s3Key('a1', 'shantou-speaker', '.webm')
    const chaozhou = audioTable('chaozhou', { a1: [clip({ speaker: 'jky' })] })
    const shantou = audioTable('shantou', { a1: [clip({ speaker: 'shantou-speaker' })] })

    const referenced = collectReferencedKeys([chaozhou, shantou])
    const bucket = fakeBucket([objectAt(chaozhouKey), objectAt(shantouKey)])

    // A diff against only `chaozhou`'s references would call the Shantou
    // asset stranded and delete it out from under that variety's manifest.
    const result = await reclaimAudioAssets(referenced, { write: true, ...bucket })

    expect(result.stranded).toEqual([])
    expect(bucket.deleteCalls).toEqual([])
  })
})
