import { describe, expect, it } from 'vitest'

import type { Audio } from '@teochew/core'
import { collectReferencedUrls, reclaimAudioAssets, type BucketObject } from '../src/importers/audio-reclaim.js'
import { AUDIO_CDN_BASE } from '../src/importers/s3-upload.js'

function objectUrl(key: string): string {
  return `${AUDIO_CDN_BASE}/${key}`
}

function audioTable(id: string, clips: Audio['clips'], wordClips?: Audio['wordClips']): Audio {
  return { audio: { id, variety: id }, clips, wordClips }
}

const clip = (overrides: Partial<Audio['clips'][string][number]> = {}) => ({
  url: objectUrl('clips/a1.webm'),
  confidence: 'high' as const,
  sources: ['fixture'],
  checksum: `sha256:${'a'.repeat(64)}`,
  ...overrides,
})

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
    const referenced = new Set([objectUrl('clips/a1.webm')])
    const bucket = fakeBucket([{ key: 'clips/a1.webm', url: objectUrl('clips/a1.webm') }])

    const result = await reclaimAudioAssets(referenced, bucket)

    expect(result.stranded).toEqual([])
    expect(result.objectsScanned).toBe(1)
  })

  it('reports an unreferenced object as stranded but does not delete it without --write', async () => {
    const referenced = new Set<string>()
    const bucket = fakeBucket([{ key: 'clips/a1.webm', url: objectUrl('clips/a1.webm') }])

    const result = await reclaimAudioAssets(referenced, bucket)

    expect(result.stranded).toEqual([{ key: 'clips/a1.webm', url: objectUrl('clips/a1.webm') }])
    expect(result.deleted).toEqual([])
    expect(bucket.deleteCalls).toEqual([])
  })

  it('--write deletes every stranded object and only those', async () => {
    const referenced = new Set([objectUrl('clips/live.webm')])
    const bucket = fakeBucket([
      { key: 'clips/live.webm', url: objectUrl('clips/live.webm') },
      { key: 'clips/stale.webm', url: objectUrl('clips/stale.webm') },
    ])

    const result = await reclaimAudioAssets(referenced, { write: true, ...bucket })

    expect(result.deleted).toEqual([{ key: 'clips/stale.webm', url: objectUrl('clips/stale.webm') }])
    expect(bucket.deleteCalls).toEqual(['clips/stale.webm'])
  })
})

describe('collectReferencedUrls', () => {
  it('picks up url and cafUrl from both clips and wordClips', () => {
    const audio = audioTable(
      'chaozhou',
      { a1: [clip({ url: objectUrl('clips/a1.webm'), cafUrl: objectUrl('clips/a1.caf'), cafChecksum: `sha256:${'b'.repeat(64)}` })] },
      { 'a1 b2': [clip({ url: objectUrl('clips/a1-b2.webm') })] },
    )

    const urls = collectReferencedUrls([audio])

    expect(urls).toEqual(
      new Set([objectUrl('clips/a1.webm'), objectUrl('clips/a1.caf'), objectUrl('clips/a1-b2.webm')]),
    )
  })

  it('combines every variety at once — cross-variety safety (issue #241)', async () => {
    const chaozhou = audioTable('chaozhou', { a1: [clip({ url: objectUrl('clips/a1.webm') })] })
    const shantou = audioTable('shantou', { a1: [clip({ url: objectUrl('clips/a1-shantou.webm') })] })

    const referenced = collectReferencedUrls([chaozhou, shantou])
    const bucket = fakeBucket([
      { key: 'clips/a1.webm', url: objectUrl('clips/a1.webm') },
      { key: 'clips/a1-shantou.webm', url: objectUrl('clips/a1-shantou.webm') },
    ])

    // A diff against only `chaozhou`'s references would call the Shantou
    // asset stranded and delete it out from under that variety's manifest.
    const result = await reclaimAudioAssets(referenced, { write: true, ...bucket })

    expect(result.stranded).toEqual([])
    expect(bucket.deleteCalls).toEqual([])
  })
})
