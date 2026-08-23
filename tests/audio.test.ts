import { describe, expect, it } from 'vitest'

import { GITHUB_REPO, audioSchema } from '../src/schema/phonology.js'
import { checkAudio } from '../src/validate/index.js'
import { deriveReadingAudio, deriveReadingWordAudio } from '../src/build/enrich.js'
import { parsePengim } from '../src/phonology/syllable.js'
import type { Source, SourceKind } from '../src/schema/entry.js'
import { AUDIO_CLIP_URL, AUDIO_WORD_CLIP_URL, audioTable, makeClipFixture } from './helpers/audio-fixtures.js'

const VALID_URL = AUDIO_CLIP_URL
const VALID_WORD_URL = AUDIO_WORD_CLIP_URL
const VALID_CHECKSUM = `sha256:${'a'.repeat(64)}`

function source(id: string, kind: SourceKind = 'import', licence?: string): Source {
  return { id, name: id, kind, ...(licence !== undefined && { licence }) }
}

const clip = makeClipFixture(VALID_CHECKSUM)
const audio = audioTable

/** Raw (possibly invalid) input for schema tests — bypasses the typed `Audio` fixtures above. */
function rawAudio(clips: Record<string, unknown>): unknown {
  return { audio: { id: 'chaozhou', variety: 'chaozhou' }, clips }
}

describe('audioSchema', () => {
  it('accepts a minimal clip (only the required fields)', () => {
    expect(() => audioSchema.parse(audio({ dio5: clip() }))).not.toThrow()
  })

  it('accepts a fully populated clip', () => {
    const full = clip({
      note: 'citation-form recording',
      speaker: 'speaker-1',
      recorded: '2026-08-01',
    })
    expect(() => audioSchema.parse(audio({ dio5: full }))).not.toThrow()
  })

  it('rejects a clip with no sources — unlike a phonology mapping, this is required', () => {
    const bad = { url: VALID_URL, confidence: 'high', sources: [], checksum: VALID_CHECKSUM }
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a clip missing confidence', () => {
    const bad = { url: VALID_URL, sources: ['fixture'], checksum: VALID_CHECKSUM }
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a clip missing checksum — the only integrity check for an externally-hosted clip', () => {
    const bad = { url: VALID_URL, confidence: 'high', sources: ['fixture'] }
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a malformed checksum', () => {
    const bad = clip({ checksum: 'not-a-checksum' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('accepts an uppercase-hex checksum, normalising it to lowercase', () => {
    const upper = clip({ checksum: `sha256:${'A'.repeat(64)}` })
    const parsed = audioSchema.parse(rawAudio({ dio5: upper }))
    expect(parsed.clips.dio5?.checksum).toBe(VALID_CHECKSUM)
  })

  it('rejects a malformed recorded date', () => {
    const bad = clip({ recorded: '1 Aug 2026' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a calendar-invalid recorded date — well-formed but not a real day', () => {
    const bad = clip({ recorded: '2026-02-30' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a bare filename as url — the old issue #31 placeholder shape', () => {
    const bad = clip({ url: 'dio5.opus' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects an arbitrary non-GitHub-Releases https URL', () => {
    const bad = clip({ url: 'https://example.com/audio/dio5.opus' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a GitHub blob view URL — not a release asset download URL', () => {
    const bad = clip({ url: `https://github.com/${GITHUB_REPO}/blob/main/dio5.opus` })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects the floating releases/latest/download alias — a stored reference must be pinned to a tag', () => {
    const bad = clip({
      url: `https://github.com/${GITHUB_REPO}/releases/latest/download/dio5.opus`,
    })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('accepts a release pinned to a tag literally named "latest" — not the floating alias', () => {
    const ok = clip({
      url: `https://github.com/${GITHUB_REPO}/releases/download/latest/dio5.opus`,
    })
    expect(() => audioSchema.parse(rawAudio({ dio5: ok }))).not.toThrow()
  })

  it('accepts a differently-cased owner/repo — GitHub URL routing is case-insensitive there', () => {
    const ok = clip({
      url: 'https://GitHub.com/Teochew-Works/Teochew-Dictionary/releases/download/audio-chaozhou/dio5.opus',
    })
    expect(() => audioSchema.parse(rawAudio({ dio5: ok }))).not.toThrow()
  })

  it('rejects a GitHub Release asset URL from a different repo', () => {
    const bad = clip({
      url: 'https://github.com/some-other-org/some-other-repo/releases/download/audio-chaozhou/dio5.opus',
    })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('accepts wordClips alongside clips, same clip shape', () => {
    const wordClip = clip({ url: VALID_WORD_URL })
    expect(() =>
      audioSchema.parse(audioTable({}, { 'dio5 ziu1': wordClip })),
    ).not.toThrow()
  })

  it('accepts a file with no wordClips at all — optional, the common case', () => {
    expect(audioSchema.parse(audio({ dio5: clip() })).wordClips).toBeUndefined()
  })
})

describe('checkAudio', () => {
  const varietyIds = new Set(['chaozhou', 'shantou'])
  const sourceMap = new Map<string, Source>(
    [
      source('fixture', 'import', 'CC-BY-4.0'),
      source('pengim-1960', 'reference'),
      source('unclassified', 'import', 'CC-BY-NC-4.0'),
    ].map((s) => [s.id, s]),
  )
  const legalSyllables = new Set(['dio5', 'ziu1', 'xyz1'])

  it('passes a clean file', () => {
    const issues = checkAudio(
      'data/phonology/audio/chaozhou.yaml',
      audio({ dio5: clip() }),
      'chaozhou',
      varietyIds,
      sourceMap,
      legalSyllables,
    )
    expect(issues).toEqual([])
  })

  it("flags an audio.id that doesn't match the file it was loaded from", () => {
    const bad = audio({ dio5: clip() })
    bad.audio.id = 'shantou'
    const issues = checkAudio('data/phonology/audio/chaozhou.yaml', bad, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("audio.id 'shantou' does not match this file's name (chaozhou.yaml)")
  })

  it('flags an unknown variety', () => {
    const bad = audio({ dio5: clip() })
    bad.audio.variety = 'hokkien'
    const issues = checkAudio('f.yaml', bad, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("unknown variety 'hokkien'")
  })

  it('flags a clip key that is not a legal Peng\'im syllable', () => {
    const bad = audio({ abc9: clip({ url: `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/abc9.opus` }) })
    const issues = checkAudio('f.yaml', bad, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("'abc9' is not a legal Peng'im syllable")
  })

  it("warns when a clip's url doesn't reference its own syllable — a likely copy-paste from another clip", () => {
    // legal syllable, but VALID_URL (via clip()'s default) points at .../dio5.opus.
    const issues = checkAudio('f.yaml', audio({ ziu1: clip() }), 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'warning', path: 'clips.ziu1.url' })
    expect(issues[0]?.message).toContain("does not reference its own syllable 'ziu1'")
  })

  it('flags an unresolved source', () => {
    const issues = checkAudio(
      'f.yaml',
      audio({ dio5: clip({ sources: ['nope'] }) }),
      'chaozhou',
      varietyIds,
      sourceMap,
      legalSyllables,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("unknown source 'nope'")
  })

  it('flags a clip backed only by a kind: reference source', () => {
    // pengim-1960 is evidence about the language, not a citable origin for a
    // clip's actual recording — same rule checkEntrySources applies to entries.
    const issues = checkAudio(
      'f.yaml',
      audio({ dio5: clip({ sources: ['pengim-1960'] }) }),
      'chaozhou',
      varietyIds,
      sourceMap,
      legalSyllables,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("source 'pengim-1960' is kind: reference")
  })

  it('flags a clip whose only source has an unclassified licence', () => {
    const issues = checkAudio(
      'f.yaml',
      audio({ dio5: clip({ sources: ['unclassified'] }) }),
      'chaozhou',
      varietyIds,
      sourceMap,
      legalSyllables,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('unresolvable licence')
  })

  it('does not require attestation — a legal but unattested syllable is fine', () => {
    // 'xyz1' is legal but has no attested_entries in this fixture's world;
    // recording ahead of dictionary coverage must not be blocked.
    const bad = audio({ xyz1: clip({ url: `https://github.com/${GITHUB_REPO}/releases/download/audio-chaozhou/xyz1.opus` }) })
    const issues = checkAudio('f.yaml', bad, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toEqual([])
  })

  it('passes a clean wordClips entry', () => {
    const table = audioTable({}, { 'dio5 ziu1': clip({ url: VALID_WORD_URL }) })
    const issues = checkAudio('f.yaml', table, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toEqual([])
  })

  it('flags a wordClips key that does not parse as Peng\'im', () => {
    const url = `https://github.com/${GITHUB_REPO}/releases/download/audio-lingualibre/not-pengim.opus`
    const table = audioTable({}, { 'not pengim!!': clip({ url }) })
    const issues = checkAudio('f.yaml', table, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("wordClips key 'not pengim!!' is not valid Peng'im")
  })

  it('flags a single-syllable wordClips key — belongs in clips instead', () => {
    const table = audioTable({}, { dio5: clip({ url: VALID_URL }) })
    const issues = checkAudio('f.yaml', table, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("'dio5' is a single syllable — belongs in 'clips', not 'wordClips'")
  })

  it('flags a wordClips key containing an illegal syllable', () => {
    // 'ang1' parses as well-formed Peng'im but isn't in this fixture's legalSyllables set.
    const table = audioTable({}, { 'dio5 ang1': clip({ url: VALID_WORD_URL }) })
    const issues = checkAudio('f.yaml', table, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("'dio5 ang1' contains 'ang1', not a legal Peng'im syllable")
  })

  it("warns when a wordClips url doesn't reference the key's first syllable", () => {
    const table = audioTable({}, { 'ziu1 dio5': clip({ url: VALID_URL }) })
    const issues = checkAudio('f.yaml', table, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'warning', path: 'wordClips.ziu1 dio5.url' })
  })

  it('flags an unresolved source on a wordClips entry', () => {
    const table = audioTable({}, { 'dio5 ziu1': clip({ url: VALID_WORD_URL, sources: ['nope'] }) })
    const issues = checkAudio('f.yaml', table, 'chaozhou', varietyIds, sourceMap, legalSyllables)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("unknown source 'nope'")
  })
})

describe('deriveReadingAudio', () => {
  const sources = new Map<string, Source>(
    [
      source('fixture', 'import', 'CC-BY-4.0'),
      source('teochew-dictionary-audio', 'import', 'CC-BY-4.0'),
      source('unclassified', 'import', 'CC-BY-NC-4.0'),
      source('audio-import-sa', 'import', 'CC-BY-SA-4.0'),
    ].map((s) => [s.id, s]),
  )

  it('returns null for every syllable when the variety has no audio metadata', () => {
    const syllables = parsePengim('dio5 ziu1')
    expect(deriveReadingAudio(syllables, null, sources)).toEqual([null, null])
  })

  it('resolves a clip per syllable, preserving order, null where absent', () => {
    const syllables = parsePengim('dio5 ziu1')
    const table = audio({ dio5: clip({ confidence: 'medium' }) })
    expect(deriveReadingAudio(syllables, table, sources)).toEqual([
      { key: 'dio5', url: VALID_URL, confidence: 'medium', licence: 'CC-BY-4.0', attributions: [] },
      null,
    ])
  })

  it('is variety-scoped by construction — callers pass the already-resolved table, no fallback here', () => {
    const syllables = parsePengim('dio5')
    const table = audio({ dio5: clip() })
    expect(deriveReadingAudio(syllables, table, sources)).toEqual([
      { key: 'dio5', url: VALID_URL, confidence: 'high', licence: 'CC-BY-4.0', attributions: [] },
    ])
  })

  it("derives licence/attributions from the clip's own sources, matching the real teochew-dictionary-audio shape", () => {
    const syllables = parsePengim('dio5')
    const table = audio({ dio5: clip({ sources: ['teochew-dictionary-audio'] }) })
    expect(deriveReadingAudio(syllables, table, sources)).toEqual([
      { key: 'dio5', url: VALID_URL, confidence: 'high', licence: 'CC-BY-4.0', attributions: [] },
    ])
  })

  it('carries a non-BASE_LICENCE source through to licence and attributions', () => {
    const syllables = parsePengim('dio5')
    const table = audio({ dio5: clip({ sources: ['audio-import-sa'] }) })
    expect(deriveReadingAudio(syllables, table, sources)).toEqual([
      {
        key: 'dio5',
        url: VALID_URL,
        confidence: 'high',
        licence: 'CC-BY-SA-4.0',
        attributions: ['audio-import-sa (CC-BY-SA-4.0)'],
      },
    ])
  })

  it('throws when a clip cites a source with an unresolvable licence — trusted not to happen post-validate', () => {
    const syllables = parsePengim('dio5')
    const table = audio({ dio5: clip({ sources: ['unclassified'] }) })
    expect(() => deriveReadingAudio(syllables, table, sources)).toThrow(/not classified as permissive or share-alike/u)
  })
})

describe('deriveReadingWordAudio', () => {
  const sources = new Map<string, Source>(
    [
      source('fixture', 'import', 'CC-BY-4.0'),
      source('lingualibre', 'import', 'CC-BY-SA-4.0'),
      source('unclassified', 'import', 'CC-BY-NC-4.0'),
    ].map((s) => [s.id, s]),
  )

  it('returns null when the variety has no audio metadata', () => {
    expect(deriveReadingWordAudio('dio5 ziu1', null, sources)).toBeNull()
  })

  it('returns null when the variety has audio metadata but no wordClips at all', () => {
    const table = audio({ dio5: clip() })
    expect(deriveReadingWordAudio('dio5 ziu1', table, sources)).toBeNull()
  })

  it('returns null when wordClips exists but has no entry for this reading', () => {
    const table = audioTable({}, { 'dio5 ziu1': clip({ url: VALID_WORD_URL }) })
    expect(deriveReadingWordAudio('ziu1 dio5', table, sources)).toBeNull()
  })

  it('resolves a word clip keyed by the exact reading string', () => {
    const table = audioTable({}, { 'dio5 ziu1': clip({ url: VALID_WORD_URL, confidence: 'medium' }) })
    expect(deriveReadingWordAudio('dio5 ziu1', table, sources)).toEqual({
      key: 'dio5 ziu1',
      url: VALID_WORD_URL,
      confidence: 'medium',
      licence: 'CC-BY-4.0',
      attributions: [],
    })
  })

  it('carries a non-BASE_LICENCE source through to licence and attributions', () => {
    const table = audioTable({}, { 'dio5 ziu1': clip({ url: VALID_WORD_URL, sources: ['lingualibre'] }) })
    expect(deriveReadingWordAudio('dio5 ziu1', table, sources)).toEqual({
      key: 'dio5 ziu1',
      url: VALID_WORD_URL,
      confidence: 'high',
      licence: 'CC-BY-SA-4.0',
      attributions: ['lingualibre (CC-BY-SA-4.0)'],
    })
  })

  it('throws when a clip cites a source with an unresolvable licence — trusted not to happen post-validate', () => {
    const table = audioTable({}, { 'dio5 ziu1': clip({ url: VALID_WORD_URL, sources: ['unclassified'] }) })
    expect(() => deriveReadingWordAudio('dio5 ziu1', table, sources)).toThrow(
      /not classified as permissive or share-alike/u,
    )
  })
})
