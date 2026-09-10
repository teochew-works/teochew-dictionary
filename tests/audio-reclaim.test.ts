import { describe, expect, it } from 'vitest'

import { GITHUB_REPO, type Audio } from '@teochew/core'
import { collectReferencedUrls, reclaimAudioAssets, type ReleaseAsset } from '../src/importers/audio-reclaim.js'

const TAG = 'audio-teochew-dictionary-audio'
const CAF_TAG = 'audio-chaozhou-caf'

function assetUrl(tag: string, name: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${name}`
}

function audioTable(id: string, clips: Audio['clips'], wordClips?: Audio['wordClips']): Audio {
  return { audio: { id, variety: id }, clips, wordClips }
}

const clip = (overrides: Partial<Audio['clips'][string][number]> = {}) => ({
  url: assetUrl(TAG, 'a1.webm'),
  confidence: 'high' as const,
  sources: ['fixture'],
  checksum: `sha256:${'a'.repeat(64)}`,
  ...overrides,
})

/** Fake `gh` hooks recording every call into an array — no real `gh` ever runs. */
function fakeGh(assetsByTag: Record<string, ReleaseAsset[]>) {
  const deleteAssetCalls: Array<[string, string]> = []
  return {
    listTags: () => Object.keys(assetsByTag),
    listAssets: (tag: string) => assetsByTag[tag] ?? [],
    deleteAsset: (tag: string, name: string) => {
      deleteAssetCalls.push([tag, name])
    },
    deleteAssetCalls,
  }
}

describe('reclaimAudioAssets', () => {
  it('leaves a referenced asset alone', () => {
    const referenced = new Set([assetUrl(TAG, 'a1.webm')])
    const gh = fakeGh({ [TAG]: [{ name: 'a1.webm', url: assetUrl(TAG, 'a1.webm') }] })

    const result = reclaimAudioAssets(referenced, gh)

    expect(result.stranded).toEqual([])
    expect(result.assetsScanned).toBe(1)
  })

  it('reports an unreferenced asset as stranded but does not delete it without --write', () => {
    const referenced = new Set<string>()
    const gh = fakeGh({ [TAG]: [{ name: 'a1.webm', url: assetUrl(TAG, 'a1.webm') }] })

    const result = reclaimAudioAssets(referenced, gh)

    expect(result.stranded).toEqual([{ tag: TAG, name: 'a1.webm', url: assetUrl(TAG, 'a1.webm') }])
    expect(result.deleted).toEqual([])
    expect(gh.deleteAssetCalls).toEqual([])
  })

  it('--write deletes every stranded asset and only those', () => {
    const referenced = new Set([assetUrl(TAG, 'live.webm')])
    const gh = fakeGh({
      [TAG]: [
        { name: 'live.webm', url: assetUrl(TAG, 'live.webm') },
        { name: 'stale.webm', url: assetUrl(TAG, 'stale.webm') },
      ],
    })

    const result = reclaimAudioAssets(referenced, { write: true, ...gh })

    expect(result.deleted).toEqual([{ tag: TAG, name: 'stale.webm', url: assetUrl(TAG, 'stale.webm') }])
    expect(gh.deleteAssetCalls).toEqual([[TAG, 'stale.webm']])
  })

  it('scans every audio-* release tag returned by listTags, combining their assets', () => {
    const referenced = new Set<string>()
    const gh = fakeGh({
      [TAG]: [{ name: 'a1.webm', url: assetUrl(TAG, 'a1.webm') }],
      [CAF_TAG]: [{ name: 'a1.caf', url: assetUrl(CAF_TAG, 'a1.caf') }],
    })

    const result = reclaimAudioAssets(referenced, gh)

    expect(result.tags).toEqual([TAG, CAF_TAG])
    expect(result.assetsScanned).toBe(2)
    expect(result.stranded).toHaveLength(2)
  })
})

describe('collectReferencedUrls', () => {
  it('picks up url and cafUrl from both clips and wordClips', () => {
    const audio = audioTable(
      'chaozhou',
      { a1: [clip({ url: assetUrl(TAG, 'a1.webm'), cafUrl: assetUrl(CAF_TAG, 'a1.caf'), cafChecksum: `sha256:${'b'.repeat(64)}` })] },
      { 'a1 b2': [clip({ url: assetUrl(TAG, 'a1-b2.webm') })] },
    )

    const urls = collectReferencedUrls([audio])

    expect(urls).toEqual(
      new Set([assetUrl(TAG, 'a1.webm'), assetUrl(CAF_TAG, 'a1.caf'), assetUrl(TAG, 'a1-b2.webm')]),
    )
  })

  it('combines every variety at once — cross-variety safety (issue #241)', () => {
    const chaozhou = audioTable('chaozhou', { a1: [clip({ url: assetUrl(TAG, 'a1.webm') })] })
    const shantou = audioTable('shantou', { a1: [clip({ url: assetUrl(TAG, 'a1-shantou.webm') })] })

    const referenced = collectReferencedUrls([chaozhou, shantou])
    const gh = fakeGh({
      [TAG]: [
        { name: 'a1.webm', url: assetUrl(TAG, 'a1.webm') },
        { name: 'a1-shantou.webm', url: assetUrl(TAG, 'a1-shantou.webm') },
      ],
    })

    // A diff against only `chaozhou`'s references would call the Shantou
    // asset stranded and delete it out from under that variety's manifest.
    const result = reclaimAudioAssets(referenced, { write: true, ...gh })

    expect(result.stranded).toEqual([])
    expect(gh.deleteAssetCalls).toEqual([])
  })
})
