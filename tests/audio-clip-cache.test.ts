import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checksumHex, clipCachePath, ensureClipCached, manifestClips, primaryClips } from '../src/audio/clip-cache.js'
import { audioTable, makeClipFixture } from './helpers/audio-fixtures.js'

const BYTES = Buffer.from('real webm bytes')
const SHA = createHash('sha256').update(BYTES).digest('hex')
const clip = makeClipFixture(`sha256:${SHA}`)

function response(body: Buffer, status = 200): Response {
  return new Response(new Uint8Array(body), { status })
}

describe('clip cache', () => {
  let cacheDir: string

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'audio-clip-cache-test-'))
  })

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true })
  })

  it('keys the cache by bare sha256 hex, case-folded', () => {
    expect(checksumHex('sha256:ABCdef')).toBe('abcdef')
    expect(clipCachePath('sha256:abc', cacheDir)).toBe(join(cacheDir, 'abc.webm'))
  })

  it('fetches a missing clip and writes it under its checksum', async () => {
    const urls: string[] = []
    const result = await ensureClipCached(clip(), {
      cacheDir,
      fetchClip: async (url) => {
        urls.push(url)
        return response(BYTES)
      },
    })

    expect(result).toEqual({ ok: true, path: join(cacheDir, `${SHA}.webm`), fetched: true })
    expect(readFileSync(join(cacheDir, `${SHA}.webm`))).toEqual(BYTES)
    expect(urls).toEqual([clip().url])
  })

  it('does not fetch a clip already cached intact', async () => {
    writeFileSync(join(cacheDir, `${SHA}.webm`), BYTES)
    const result = await ensureClipCached(clip(), {
      cacheDir,
      fetchClip: async () => {
        throw new Error('should not fetch')
      },
    })
    expect(result).toEqual({ ok: true, path: join(cacheDir, `${SHA}.webm`), fetched: false })
  })

  it('re-fetches a cached file whose bytes no longer match its name', async () => {
    writeFileSync(join(cacheDir, `${SHA}.webm`), Buffer.from('truncated'))
    const result = await ensureClipCached(clip(), { cacheDir, fetchClip: async () => response(BYTES) })
    expect(result).toMatchObject({ ok: true, fetched: true })
    expect(readFileSync(join(cacheDir, `${SHA}.webm`))).toEqual(BYTES)
  })

  it('refuses to cache a download that fails its checksum', async () => {
    const result = await ensureClipCached(clip(), { cacheDir, fetchClip: async () => response(Buffer.from('wrong')) })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('checksum mismatch') })
    expect(existsSync(join(cacheDir, `${SHA}.webm`))).toBe(false)
  })

  it('reports an HTTP failure and a thrown fetch without writing', async () => {
    expect(await ensureClipCached(clip(), { cacheDir, fetchClip: async () => response(Buffer.alloc(0), 404) })).toEqual({
      ok: false,
      error: `HTTP 404 fetching ${clip().url}`,
    })
    expect(
      await ensureClipCached(clip(), {
        cacheDir,
        fetchClip: async () => {
          throw new Error('boom')
        },
      }),
    ).toEqual({ ok: false, error: `failed to fetch ${clip().url}: boom` })
  })

  it('walks syllable clips in manifest order and skips wordClips', () => {
    const audio = audioTable({ du2: clip(), dua7: [clip(), clip({ speaker: 'b' })] }, { 'du2 dua7': clip() })
    expect(manifestClips(audio).map((c) => c.path)).toEqual(['clips.du2[0]', 'clips.dua7[0]', 'clips.dua7[1]'])
  })

  it('primaryClips keeps one clip per real speaker and excludes every synthesis render (ADR-0029)', () => {
    const jkyPrimary = clip({ speaker: 'jky', primary: true })
    const jkyTake2 = clip({ speaker: 'jky', take: 2, checksum: `sha256:${'b'.repeat(64)}` })
    const jkyTake3 = clip({ speaker: 'jky', take: 3, checksum: `sha256:${'c'.repeat(64)}` })
    const jkyRender = clip({
      speaker: 'jky-n',
      synthesis: 'world-retune',
      derivedFrom: jkyPrimary.checksum,
      confidence: 'medium',
      checksum: `sha256:${'d'.repeat(64)}`,
    })
    const abc = clip({ speaker: 'abc', checksum: `sha256:${'e'.repeat(64)}` })
    const audio = audioTable({ dio5: [jkyPrimary, jkyTake2, jkyTake3, jkyRender, abc] })

    expect(primaryClips(audio).map((c) => c.clip)).toEqual([jkyPrimary, abc])
  })
})
