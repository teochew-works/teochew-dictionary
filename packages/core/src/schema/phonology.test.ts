import { describe, expect, it } from 'vitest'

import { audioSchema, GITHUB_REPO } from './phonology.js'

/**
 * Accept/reject coverage for the two hosts `audioClip.url`/`cafUrl` admit
 * (ADR-0026, issue #270) — a closed allowlist, never an open `z.url()`. No
 * prior test exercised this regex directly; `search/filters.test.ts`'s
 * `CLIP` fixture only exercises trim/URL-suffix logic downstream of it.
 */

const GITHUB_URL = `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/dio5.webm`
const CLOUDFRONT_URL = 'https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.webm'

function audioWithUrl(url: string, overrides: Record<string, unknown> = {}) {
  return {
    audio: { id: 'chaozhou', variety: 'chaozhou' },
    clips: {
      dio5: [
        {
          url,
          confidence: 'high',
          sources: ['fixture'],
          checksum: `sha256:${'a'.repeat(64)}`,
          ...overrides,
        },
      ],
    },
  }
}

describe('audioClip url/cafUrl host allowlist', () => {
  it('accepts a GitHub Release asset download URL', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL)).success).toBe(true)
  })

  it('accepts a CloudFront audio URL', () => {
    expect(audioSchema.safeParse(audioWithUrl(CLOUDFRONT_URL)).success).toBe(true)
  })

  it('accepts a CloudFront cafUrl alongside a GitHub url', () => {
    const result = audioSchema.safeParse(
      audioWithUrl(GITHUB_URL, {
        cafUrl: 'https://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.caf',
        cafChecksum: `sha256:${'b'.repeat(64)}`,
      }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects a URL pointing at a different GitHub repo', () => {
    const url = 'https://github.com/someone-else/other-repo/releases/download/audio-chaozhou/dio5.webm'
    expect(audioSchema.safeParse(audioWithUrl(url)).success).toBe(false)
  })

  it('rejects the floating /releases/latest/download/ alias', () => {
    const url = `https://github.com/${GITHUB_REPO}/releases/latest/download/dio5.webm`
    expect(audioSchema.safeParse(audioWithUrl(url)).success).toBe(false)
  })

  it('rejects an arbitrary S3 bucket URL, not just the CloudFront distribution', () => {
    const url = 'https://teochew-dictionary-audio.s3.amazonaws.com/clips/dio5.webm'
    expect(audioSchema.safeParse(audioWithUrl(url)).success).toBe(false)
  })

  it('rejects an arbitrary other CloudFront distribution', () => {
    const url = 'https://some-other-distribution.cloudfront.net/teochew/clips/jky/dio5.webm'
    expect(audioSchema.safeParse(audioWithUrl(url)).success).toBe(false)
  })

  it('rejects a plain http:// URL even on an otherwise-valid host', () => {
    const url = 'http://daidb11aas52z.cloudfront.net/teochew/clips/jky/dio5.webm'
    expect(audioSchema.safeParse(audioWithUrl(url)).success).toBe(false)
  })

  it('rejects a URL with no path at all', () => {
    expect(audioSchema.safeParse(audioWithUrl('https://daidb11aas52z.cloudfront.net/')).success).toBe(false)
  })
})

/**
 * Accept/reject coverage for `audioClip.take`/`primary` (ADR-0029, issue
 * #290). Cross-clip rules (uniqueness of `(speaker, take)`, exactly-one-primary
 * per group) belong to `src/validate/index.ts`, not this schema — these tests
 * only cover what a single clip may carry.
 */
describe('audioClip take/primary', () => {
  it('accepts a clip with take: 2', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL, { take: 2 })).success).toBe(true)
  })

  it('accepts a clip with primary: true', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL, { primary: true })).success).toBe(true)
  })

  it('accepts an existing-style clip with neither take nor primary', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL)).success).toBe(true)
  })

  it('rejects take: 1 (absent means first take, so 1 is never spelled out)', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL, { take: 1 })).success).toBe(false)
  })

  it('rejects take: 0', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL, { take: 0 })).success).toBe(false)
  })

  it('rejects a non-integer take', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL, { take: 2.5 })).success).toBe(false)
  })

  it('rejects primary: false (literal true only, no false state)', () => {
    expect(audioSchema.safeParse(audioWithUrl(GITHUB_URL, { primary: false })).success).toBe(false)
  })

  it('rejects a synthesis clip that also carries take', () => {
    const result = audioSchema.safeParse(
      audioWithUrl(GITHUB_URL, {
        confidence: 'medium',
        synthesis: 'world-retune',
        derivedFrom: `sha256:${'c'.repeat(64)}`,
        take: 2,
      }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects a synthesis clip that also carries primary', () => {
    const result = audioSchema.safeParse(
      audioWithUrl(GITHUB_URL, {
        confidence: 'medium',
        synthesis: 'world-retune',
        derivedFrom: `sha256:${'c'.repeat(64)}`,
        primary: true,
      }),
    )
    expect(result.success).toBe(false)
  })
})
