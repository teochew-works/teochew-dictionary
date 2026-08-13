import { describe, expect, it } from 'vitest'

import { audioSchema, type Audio } from '../src/schema/phonology.js'
import { checkAudio } from '../src/validate/index.js'
import { deriveReadingAudio } from '../src/build/enrich.js'
import { parsePengim } from '../src/phonology/syllable.js'
import type { Source, SourceKind } from '../src/schema/entry.js'

function source(id: string, kind: SourceKind = 'import', licence?: string): Source {
  return { id, name: id, kind, ...(licence !== undefined && { licence }) }
}

function clip(overrides: Partial<Audio['clips'][string]> = {}): Audio['clips'][string] {
  return {
    file: 'dio5.opus',
    confidence: 'high',
    sources: ['fixture'],
    ...overrides,
  }
}

function audio(clips: Audio['clips'] = {}): Audio {
  return {
    audio: { id: 'chaozhou', variety: 'chaozhou' },
    clips,
  }
}

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
      checksum: `sha256:${'a'.repeat(64)}`,
    })
    expect(() => audioSchema.parse(audio({ dio5: full }))).not.toThrow()
  })

  it('rejects a clip with no sources — unlike a phonology mapping, this is required', () => {
    const bad = { file: 'dio5.opus', confidence: 'high', sources: [] }
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a clip missing confidence', () => {
    const bad = { file: 'dio5.opus', sources: ['fixture'] }
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a malformed checksum', () => {
    const bad = clip({ checksum: 'not-a-checksum' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })

  it('rejects a malformed recorded date', () => {
    const bad = clip({ recorded: '1 Aug 2026' })
    expect(() => audioSchema.parse(rawAudio({ dio5: bad }))).toThrow()
  })
})

describe('checkAudio', () => {
  const varietyIds = new Set(['chaozhou', 'shantou'])
  const sourceMap = new Map<string, Source>(
    [
      source('fixture', 'import', 'CC-BY-4.0'),
      source('pengim-1960', 'reference'),
      source('unclassified', 'import', 'CC0'),
    ].map((s) => [s.id, s]),
  )
  const legalSyllables = new Set(['dio5', 'ziu1'])
  const audioFiles = new Set(['dio5.opus'])

  it('passes a clean file', () => {
    const issues = checkAudio(
      'data/phonology/audio/chaozhou.yaml',
      audio({ dio5: clip() }),
      varietyIds,
      sourceMap,
      legalSyllables,
      audioFiles,
    )
    expect(issues).toEqual([])
  })

  it('flags an unknown variety', () => {
    const bad = audio({ dio5: clip() })
    bad.audio.variety = 'hokkien'
    const issues = checkAudio('f.yaml', bad, varietyIds, sourceMap, legalSyllables, audioFiles)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("unknown variety 'hokkien'")
  })

  it('flags a clip key that is not a legal Peng\'im syllable', () => {
    const issues = checkAudio(
      'f.yaml',
      audio({ xyz1: clip({ file: 'dio5.opus' }) }),
      varietyIds,
      sourceMap,
      legalSyllables,
      audioFiles,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("'xyz1' is not a legal Peng'im syllable")
  })

  it('flags a missing audio file', () => {
    const issues = checkAudio(
      'f.yaml',
      audio({ ziu1: clip({ file: 'ziu1.opus' }) }),
      varietyIds,
      sourceMap,
      legalSyllables,
      audioFiles,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("audio file 'ziu1.opus' not found")
  })

  it('flags an unresolved source', () => {
    const issues = checkAudio(
      'f.yaml',
      audio({ dio5: clip({ sources: ['nope'] }) }),
      varietyIds,
      sourceMap,
      legalSyllables,
      audioFiles,
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
      varietyIds,
      sourceMap,
      legalSyllables,
      audioFiles,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("source 'pengim-1960' is kind: reference")
  })

  it('flags a clip whose only source has an unclassified licence', () => {
    const issues = checkAudio(
      'f.yaml',
      audio({ dio5: clip({ sources: ['unclassified'] }) }),
      varietyIds,
      sourceMap,
      legalSyllables,
      audioFiles,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('unresolvable licence')
  })

  it('does not require attestation — a legal but unattested syllable is fine', () => {
    // 'ziu1' is legal but has no attested_entries in this fixture's world;
    // recording ahead of dictionary coverage must not be blocked.
    const issues = checkAudio(
      'f.yaml',
      audio({ ziu1: clip({ file: 'dio5.opus' }) }),
      varietyIds,
      sourceMap,
      legalSyllables,
      audioFiles,
    )
    expect(issues).toEqual([])
  })
})

describe('deriveReadingAudio', () => {
  it('returns null for every syllable when the variety has no audio metadata', () => {
    const syllables = parsePengim('dio5 ziu1')
    expect(deriveReadingAudio(syllables, null)).toEqual([null, null])
  })

  it('resolves a clip per syllable, preserving order, null where absent', () => {
    const syllables = parsePengim('dio5 ziu1')
    const table = audio({ dio5: clip({ file: 'dio5.opus', confidence: 'medium' }) })
    expect(deriveReadingAudio(syllables, table)).toEqual([
      { syllable: 'dio5', file: 'dio5.opus', confidence: 'medium' },
      null,
    ])
  })

  it('is variety-scoped by construction — callers pass the already-resolved table, no fallback here', () => {
    const syllables = parsePengim('dio5')
    const table = audio({ dio5: clip() })
    expect(deriveReadingAudio(syllables, table)).toEqual([
      { syllable: 'dio5', file: 'dio5.opus', confidence: 'high' },
    ])
  })
})
