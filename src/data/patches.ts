import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { PATCHES_DIR } from '../paths.js'
import { readingPatchesFileSchema, type ReadingPatch } from '../schema/patches.js'
import type { RawFile } from './load.js'

/**
 * Load-time reading corrections (ADR-0028). `data/entries/*.yaml` mirrors an
 * import source and must stay byte-identical to it, so a confirmed typo or
 * variety mistag is corrected here — in memory, at read time — instead of by
 * editing the entry file. `readEntryFiles()` (`src/data/load.ts`) applies
 * these to every consumer (build, the syllable inventory, validation)
 * through one seam.
 */

export interface PatchProblem {
  patch: ReadingPatch
  reason: 'not-found' | 'ambiguous'
  matchCount: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A `raw.entries[].readings[]` slot a patch could apply to. */
interface ReadingLocation {
  fileIndex: number
  entryIndex: number
  readingIndex: number
  reading: Record<string, unknown>
}

/** Every reading slot in `files`, defensively — `raw` is `unknown` until Zod validates it. */
function* readingLocations(files: RawFile[]): Generator<{ location: ReadingLocation; entryId: string }> {
  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const raw = files[fileIndex]!.raw
    if (!isRecord(raw) || !Array.isArray(raw.entries)) continue

    for (let entryIndex = 0; entryIndex < raw.entries.length; entryIndex++) {
      const entry = raw.entries[entryIndex]
      if (!isRecord(entry) || typeof entry.id !== 'string' || !Array.isArray(entry.readings)) continue

      for (let readingIndex = 0; readingIndex < entry.readings.length; readingIndex++) {
        const reading = entry.readings[readingIndex]
        if (!isRecord(reading)) continue
        yield { location: { fileIndex, entryIndex, readingIndex, reading }, entryId: entry.id }
      }
    }
  }
}

function matchesPatch(patch: ReadingPatch, entryId: string, reading: Record<string, unknown>): boolean {
  if (entryId !== patch.entry) return false
  if (reading.pengim !== patch.match.pengim) return false
  if (patch.match.variety !== undefined) {
    const variety = typeof reading.variety === 'string' ? reading.variety : 'chaozhou'
    if (variety !== patch.match.variety) return false
  }
  return true
}

function findMatches(files: RawFile[], patch: ReadingPatch): ReadingLocation[] {
  const matches: ReadingLocation[] = []
  for (const { location, entryId } of readingLocations(files)) {
    if (matchesPatch(patch, entryId, location.reading)) matches.push(location)
  }
  return matches
}

export function loadReadingPatches(): ReadingPatch[] {
  if (!existsSync(PATCHES_DIR)) return []
  const files = readdirSync(PATCHES_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  return files.flatMap((file) => {
    const raw = parseYaml(readFileSync(join(PATCHES_DIR, file), 'utf8'))
    return readingPatchesFileSchema.parse(raw).patches
  })
}

/**
 * Applies every patch with exactly one match, in memory. A patch with zero
 * or more than one match is left unapplied — never thrown — so a stale patch
 * can't crash every command that transitively loads entries; `findPatchProblems`
 * is what surfaces that loudly, in `validate()`.
 */
export function applyReadingPatches(files: RawFile[], patches: ReadingPatch[] = loadReadingPatches()): RawFile[] {
  if (patches.length === 0) return files

  // Deep-clone only the entries arrays that actually get touched, via
  // structuredClone of the whole raw doc — entry files are small, and this
  // keeps the match-finding above working against untouched originals for
  // every patch, not just the first one applied.
  const cloned = files.map((f) => ({ ...f, raw: structuredClone(f.raw) }))

  for (const patch of patches) {
    const matches = findMatches(cloned, patch)
    if (matches.length !== 1) continue
    const { reading } = matches[0]!
    if (patch.set.pengim !== undefined) reading.pengim = patch.set.pengim
    if (patch.set.variety !== undefined) reading.variety = patch.set.variety
    if (reading.note === undefined) {
      reading.note = `Corrected at load time from '${patch.match.pengim}' — ${patch.reason} (patch ${patch.id}${
        patch.issue !== undefined ? `, issue #${patch.issue}` : ''
      }).`
    }
  }

  return cloned
}

/** Patches with zero or more than one match against `files` — must be the *unpatched* raw. */
export function findPatchProblems(files: RawFile[], patches: ReadingPatch[] = loadReadingPatches()): PatchProblem[] {
  const problems: PatchProblem[] = []
  for (const patch of patches) {
    const matchCount = findMatches(files, patch).length
    if (matchCount === 1) continue
    problems.push({ patch, reason: matchCount === 0 ? 'not-found' : 'ambiguous', matchCount })
  }
  return problems
}
