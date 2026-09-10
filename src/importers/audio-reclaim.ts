import { execFileSync } from 'node:child_process'

import type { Audio } from '@teochew/core'

/**
 * Finds and (behind `--write`) deletes GitHub Release assets under every
 * `audio-*` release tag that no variety's audio manifest references any
 * more — superseded re-recordings whose filename is now referenced under a
 * later release (issue #241, ADR-0014: the 1000-asset-per-release cap counts
 * these too, and the first `.webm` release sits at the cap with only 28%
 * live).
 *
 * Driven by `src/cli/audio-reclaim.ts`; kept separate from that thin CLI
 * script (a bare top-level script body, like every other file under
 * src/cli/) so this logic stays importable and unit-testable.
 */

const AUDIO_RELEASE_TAG_PREFIX = 'audio-'

export interface ReleaseAsset {
  name: string
  url: string
}

export interface StrandedAsset {
  tag: string
  name: string
  url: string
}

export interface ReclaimOptions {
  write?: boolean
  /** Injectable for tests — avoids shelling out to a real `gh release list`. */
  listTags?: () => string[]
  /** Injectable for tests — avoids shelling out to a real `gh release view`. */
  listAssets?: (tag: string) => ReleaseAsset[]
  /** Injectable for tests — avoids shelling out to a real `gh release delete-asset`. */
  deleteAsset?: (tag: string, name: string) => void
}

export interface ReclaimResult {
  tags: string[]
  assetsScanned: number
  stranded: StrandedAsset[]
  deleted: StrandedAsset[]
}

/**
 * Every clip/CAF URL referenced by ANY variety's audio manifest, combined.
 * Must be built across every variety at once, not one at a time — an asset
 * stranded for one variety's manifest can be the live asset for another
 * variety, and diffing release assets against only one variety's references
 * would delete it out from under that other variety.
 */
export function collectReferencedUrls(audios: Audio[]): Set<string> {
  const urls = new Set<string>()
  for (const audio of audios) {
    for (const bucket of ['clips', 'wordClips'] as const) {
      for (const clips of Object.values(audio[bucket] ?? {})) {
        for (const clip of clips) {
          urls.add(clip.url)
          if (clip.cafUrl) urls.add(clip.cafUrl)
        }
      }
    }
  }
  return urls
}

function defaultListTags(): string[] {
  const out = execFileSync('gh', ['release', 'list', '--json', 'tagName', '--jq', '.[].tagName'], {
    encoding: 'utf8',
  })
  return out
    .split('\n')
    .filter((t) => t.startsWith(AUDIO_RELEASE_TAG_PREFIX))
    .sort()
}

function defaultListAssets(tag: string): ReleaseAsset[] {
  const out = execFileSync(
    'gh',
    ['release', 'view', tag, '--json', 'assets', '--jq', '.assets[] | {name, url}'],
    { encoding: 'utf8' },
  )
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReleaseAsset)
}

function defaultDeleteAsset(tag: string, name: string): void {
  execFileSync('gh', ['release', 'delete-asset', tag, name, '--yes'], { stdio: 'inherit' })
}

/**
 * Diffs every `audio-*` release's actual assets against `referencedUrls`
 * (see `collectReferencedUrls`) and, when `write`, deletes the ones no
 * manifest references any more.
 */
export function reclaimAudioAssets(referencedUrls: Set<string>, options: ReclaimOptions = {}): ReclaimResult {
  const {
    write = false,
    listTags = defaultListTags,
    listAssets = defaultListAssets,
    deleteAsset = defaultDeleteAsset,
  } = options

  const tags = listTags()
  const stranded: StrandedAsset[] = []
  let assetsScanned = 0

  for (const tag of tags) {
    for (const asset of listAssets(tag)) {
      assetsScanned += 1
      if (!referencedUrls.has(asset.url)) {
        stranded.push({ tag, name: asset.name, url: asset.url })
      }
    }
  }

  const deleted: StrandedAsset[] = []
  if (write) {
    for (const s of stranded) {
      deleteAsset(s.tag, s.name)
      deleted.push(s)
    }
  }

  return { tags, assetsScanned, stranded, deleted }
}
