import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Audio } from '@teochew/core'
import { expectedCloudFrontUrl, rewriteManifestToS3 } from '../src/importers/audio-manifest-rewrite.js'

const GITHUB_WEBM = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/dio5.webm'
const GITHUB_WEBM_2 = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/ziu1.webm'
const GITHUB_CAF = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou-caf/dio5.caf'
const EXPECTED_CDN_URL = 'https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.webm'
const EXPECTED_CDN_URL_2 = 'https://daidb11aas52z.cloudfront.net/teochew/clips/jky/ziu1.webm'
const EXPECTED_CAF_CDN_URL = 'https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.caf'

function audioTable(clips: Audio['clips']): Audio {
  return { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips }
}

const clip = (overrides: Partial<Audio['clips'][string][number]> = {}) => ({
  url: GITHUB_WEBM,
  confidence: 'high' as const,
  sources: ['fixture'],
  speaker: 'jky',
  checksum: `sha256:${'a'.repeat(64)}`,
  ...overrides,
})

function fakeCheckExists(present: Set<string>) {
  return async (url: string) => present.has(url)
}

describe('expectedCloudFrontUrl', () => {
  it('derives the same key mirrorAudioToS3 would upload the clip to', () => {
    const audio = audioTable({ dio5: [clip()] })
    const target = { bucket: 'clips' as const, pengimKey: 'dio5', index: 0, field: 'url' as const, sourceUrl: GITHUB_WEBM, expectedChecksum: clip().checksum }
    expect(expectedCloudFrontUrl(audio, target)).toBe(EXPECTED_CDN_URL)
  })
})

describe('rewriteManifestToS3', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'audio-manifest-rewrite-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('dry run: HEAD-checks every target but writes nothing', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const audio = audioTable({ dio5: [clip()] })
    writeFileSync(path, stringify(audio))

    const result = await rewriteManifestToS3(path, audio, {
      write: false,
      checkExists: fakeCheckExists(new Set([EXPECTED_CDN_URL])),
    })

    expect(result.scanned).toBe(1)
    expect(result.rewritten).toHaveLength(1)
    expect(parseYaml(readFileSync(path, 'utf8')).clips.dio5[0].url).toBe(GITHUB_WEBM)
  })

  it('--write: rewrites url to the CloudFront URL once confirmed present', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const audio = audioTable({ dio5: [clip()] })
    writeFileSync(path, stringify(audio))

    const result = await rewriteManifestToS3(path, audio, {
      write: true,
      checkExists: fakeCheckExists(new Set([EXPECTED_CDN_URL])),
    })

    expect(result.rewritten).toEqual([
      expect.objectContaining({ bucket: 'clips', pengimKey: 'dio5', field: 'url', newUrl: EXPECTED_CDN_URL }),
    ])
    expect(parseYaml(readFileSync(path, 'utf8')).clips.dio5[0].url).toBe(EXPECTED_CDN_URL)
  })

  it('rewrites cafUrl independently of url', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const withCaf = clip({ cafUrl: GITHUB_CAF, cafChecksum: `sha256:${'b'.repeat(64)}` })
    const audio = audioTable({ dio5: [withCaf] })
    writeFileSync(path, stringify(audio))

    await rewriteManifestToS3(path, audio, {
      write: true,
      checkExists: fakeCheckExists(new Set([EXPECTED_CDN_URL, EXPECTED_CAF_CDN_URL])),
    })

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].url).toBe(EXPECTED_CDN_URL)
    expect(written.clips.dio5[0].cafUrl).toBe(EXPECTED_CAF_CDN_URL)
  })

  it('leaves a not-yet-mirrored target pointing at GitHub and reports it, rather than rewriting to a dead URL', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const table = audioTable({ dio5: [clip()], ziu1: [clip({ url: GITHUB_WEBM_2 })] })
    writeFileSync(path, stringify(table))

    // Only dio5's object actually exists in S3 — ziu1 was added to the
    // manifest after the corpus mirror ran, say.
    const result = await rewriteManifestToS3(path, table, {
      write: true,
      checkExists: fakeCheckExists(new Set([EXPECTED_CDN_URL])),
    })

    expect(result.rewritten).toEqual([expect.objectContaining({ pengimKey: 'dio5' })])
    expect(result.notYetMirrored).toEqual([
      expect.objectContaining({ pengimKey: 'ziu1', newUrl: EXPECTED_CDN_URL_2 }),
    ])

    const written = parseYaml(readFileSync(path, 'utf8'))
    expect(written.clips.dio5[0].url).toBe(EXPECTED_CDN_URL)
    expect(written.clips.ziu1[0].url).toBe(GITHUB_WEBM_2)
  })

  it('preserves a hand-written comment when rewriting', async () => {
    const path = join(dir, 'chaozhou.yaml')
    const handComment = '# hand note: dio5 is a Chaoyang-accented recording, verify before reuse'
    const audio = audioTable({ dio5: [clip()] })
    writeFileSync(path, `${handComment}\n${stringify(audio)}`)

    await rewriteManifestToS3(path, audio, {
      write: true,
      checkExists: fakeCheckExists(new Set([EXPECTED_CDN_URL])),
    })

    expect(readFileSync(path, 'utf8')).toContain(handComment)
  })
})
