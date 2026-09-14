import { describe, expect, it } from 'vitest'

import { applyReadingPatches, findPatchProblems } from '../src/data/patches.js'
import type { RawFile } from '../src/data/load.js'
import type { ReadingPatch } from '../src/schema/patches.js'

/**
 * Exercises `src/data/patches.ts` directly against synthetic entry files —
 * unlike `tests/dataset.test.ts`, which guards the real dataset end to end,
 * this covers edge cases (ambiguous/missing matches, the note-injection
 * rule) the real dataset's eight patches don't happen to hit.
 */

function rawFile(entries: unknown[], file = 'fixture.yaml'): RawFile {
  return { file, path: `data/entries/${file}`, raw: { entries } }
}

function patch(overrides: Partial<ReadingPatch> & Pick<ReadingPatch, 'entry' | 'match' | 'set'>): ReadingPatch {
  return {
    id: 'test-patch',
    reason: 'test fixture',
    confidence: 'high',
    ...overrides,
  }
}

describe('applyReadingPatches', () => {
  it('rewrites pengim on the one matching reading, leaving other readings and entries untouched', () => {
    const files = [
      rawFile([
        { id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] },
        { id: 'b-字', readings: [{ pengim: 'b1', variety: 'chaozhou' }] },
      ]),
    ]
    const patched = applyReadingPatches(files, [
      patch({ entry: 'a-字', match: { pengim: 'a1' }, set: { pengim: 'a2' } }),
    ])

    const raw = patched[0]!.raw as { entries: { id: string; readings: { pengim: string }[] }[] }
    expect(raw.entries[0]!.readings[0]!.pengim).toBe('a2')
    expect(raw.entries[1]!.readings[0]!.pengim).toBe('b1')
  })

  it('rewrites variety when the patch sets it', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    const patched = applyReadingPatches(files, [
      patch({ entry: 'a-字', match: { pengim: 'a1' }, set: { variety: 'shantou' } }),
    ])

    const raw = patched[0]!.raw as { entries: { readings: { pengim: string; variety: string }[] }[] }
    expect(raw.entries[0]!.readings[0]!.pengim).toBe('a1')
    expect(raw.entries[0]!.readings[0]!.variety).toBe('shantou')
  })

  it('uses match.variety to disambiguate two readings that share a pengim under different varieties', () => {
    const files = [
      rawFile([
        { id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }, { pengim: 'a1', variety: 'shantou' }] },
      ]),
    ]
    const patched = applyReadingPatches(files, [
      patch({ entry: 'a-字', match: { pengim: 'a1', variety: 'shantou' }, set: { pengim: 'a2' } }),
    ])

    const raw = patched[0]!.raw as { entries: { readings: { pengim: string; variety: string }[] }[] }
    expect(raw.entries[0]!.readings[0]).toEqual({ pengim: 'a1', variety: 'chaozhou' })
    expect(raw.entries[0]!.readings[1]!.pengim).toBe('a2')
    expect(raw.entries[0]!.readings[1]!.variety).toBe('shantou')
  })

  it('treats an absent variety as the default chaozhou when matching', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1' }] }])]
    const patched = applyReadingPatches(files, [
      patch({ entry: 'a-字', match: { pengim: 'a1', variety: 'chaozhou' }, set: { pengim: 'a2' } }),
    ])

    const raw = patched[0]!.raw as { entries: { readings: { pengim: string }[] }[] }
    expect(raw.entries[0]!.readings[0]!.pengim).toBe('a2')
  })

  it('leaves a reading with no matches untouched, rather than throwing', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    const patched = applyReadingPatches(files, [
      patch({ entry: 'a-字', match: { pengim: 'no-such-pengim1' }, set: { pengim: 'a2' } }),
    ])

    const raw = patched[0]!.raw as { entries: { readings: { pengim: string }[] }[] }
    expect(raw.entries[0]!.readings[0]!.pengim).toBe('a1')
  })

  it('leaves an ambiguous match (more than one reading matches) untouched', () => {
    // Two readings within the same entry sharing a pengim+variety — ambiguity
    // never arises across entries, since `entry` id is itself part of the match.
    const files = [
      rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }, { pengim: 'a1', variety: 'chaozhou' }] }]),
    ]
    const patched = applyReadingPatches(files, [
      patch({ entry: 'a-字', match: { pengim: 'a1', variety: 'chaozhou' }, set: { pengim: 'a2' } }),
    ])

    const raw = patched[0]!.raw as { entries: { readings: { pengim: string }[] }[] }
    expect(raw.entries[0]!.readings.map((r) => r.pengim)).toEqual(['a1', 'a1'])
  })

  it('injects a note documenting the correction when the reading has none', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    const patched = applyReadingPatches(files, [
      patch({ id: 'a1-typo', entry: 'a-字', match: { pengim: 'a1' }, set: { pengim: 'a2' }, issue: 282 }),
    ])

    const raw = patched[0]!.raw as { entries: { readings: { note?: string }[] }[] }
    expect(raw.entries[0]!.readings[0]!.note).toContain('a1-typo')
    expect(raw.entries[0]!.readings[0]!.note).toContain('issue #282')
  })

  it('does not overwrite an existing hand-written note', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou', note: 'hand-written' }] }])]
    const patched = applyReadingPatches(files, [
      patch({ entry: 'a-字', match: { pengim: 'a1' }, set: { pengim: 'a2' } }),
    ])

    const raw = patched[0]!.raw as { entries: { readings: { note?: string }[] }[] }
    expect(raw.entries[0]!.readings[0]!.note).toBe('hand-written')
  })

  it('returns the input unchanged (same reference) when there are no patches', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    expect(applyReadingPatches(files, [])).toBe(files)
  })

  it('never mutates the input files', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    applyReadingPatches(files, [patch({ entry: 'a-字', match: { pengim: 'a1' }, set: { pengim: 'a2' } })])

    const raw = files[0]!.raw as { entries: { readings: { pengim: string }[] }[] }
    expect(raw.entries[0]!.readings[0]!.pengim).toBe('a1')
  })
})

describe('findPatchProblems', () => {
  it('reports nothing for a patch with exactly one match', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    const problems = findPatchProblems(files, [
      patch({ entry: 'a-字', match: { pengim: 'a1' }, set: { pengim: 'a2' } }),
    ])
    expect(problems).toEqual([])
  })

  it("reports 'not-found' for a patch matching zero readings", () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    const stale = patch({ entry: 'a-字', match: { pengim: 'gone1' }, set: { pengim: 'a2' } })
    const problems = findPatchProblems(files, [stale])

    expect(problems).toEqual([{ patch: stale, reason: 'not-found', matchCount: 0 }])
  })

  it("reports 'ambiguous' for a patch matching more than one reading", () => {
    const files = [
      rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }, { pengim: 'a1', variety: 'chaozhou' }] }]),
    ]
    const dup = patch({ entry: 'a-字', match: { pengim: 'a1', variety: 'chaozhou' }, set: { pengim: 'a2' } })
    const problems = findPatchProblems(files, [dup])

    expect(problems).toEqual([{ patch: dup, reason: 'ambiguous', matchCount: 2 }])
  })

  it('checks against unpatched raw, so a patch that already applied cleanly is never mistaken for stale', () => {
    const files = [rawFile([{ id: 'a-字', readings: [{ pengim: 'a1', variety: 'chaozhou' }] }])]
    const good = patch({ entry: 'a-字', match: { pengim: 'a1' }, set: { pengim: 'a2' } })

    expect(findPatchProblems(files, [good])).toEqual([])
    // Applying it doesn't retroactively make findPatchProblems see it as stale against the original files.
    applyReadingPatches(files, [good])
    expect(findPatchProblems(files, [good])).toEqual([])
  })
})
