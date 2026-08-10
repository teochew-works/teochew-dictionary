import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { ENTRIES_DIR, SOURCES_FILE, SYLLABLE_INVENTORY_FILE } from '../paths.js'
import {
  entryFileSchema,
  sourcesFileSchema,
  type Entry,
  type Source,
} from '../schema/entry.js'
import { syllableInventorySchema, type SyllableInventory } from '../schema/inventory.js'

export interface LoadedEntry {
  entry: Entry
  /** Basename of the file the entry came from, for error reporting. */
  file: string
}

export interface RawFile {
  file: string
  path: string
  /** Unparsed YAML, so the validator can report schema errors itself. */
  raw: unknown
}

export function listEntryFiles(): string[] {
  return readdirSync(ENTRIES_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
}

/** Read every entry file as raw YAML, without schema validation. */
export function readEntryFiles(): RawFile[] {
  return listEntryFiles().map((file) => {
    const path = join(ENTRIES_DIR, file)
    return { file, path, raw: parseYaml(readFileSync(path, 'utf8')) }
  })
}

/**
 * Load and validate every entry.
 * @throws if any file fails schema validation — use the validator for a full
 * report rather than a first-failure abort.
 */
export function loadEntries(): LoadedEntry[] {
  return readEntryFiles().flatMap(({ file, raw }) => {
    const parsed = entryFileSchema.parse(raw)
    return parsed.entries.map((entry) => ({ entry, file }))
  })
}

export function loadSources(): Source[] {
  const raw = parseYaml(readFileSync(SOURCES_FILE, 'utf8'))
  return sourcesFileSchema.parse(raw).sources
}

export function loadSyllableInventory(): SyllableInventory {
  const raw = parseYaml(readFileSync(SYLLABLE_INVENTORY_FILE, 'utf8'))
  return syllableInventorySchema.parse(raw)
}
