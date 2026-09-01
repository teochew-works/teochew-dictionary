import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { AUDIO_METADATA_DIR, EXTERNAL_DIR, PHONOLOGY_DIR, SANDHI_DIR, VARIETIES_DIR } from '../paths.js'
import {
  audioSchema,
  pengimSchemeSchema,
  pojSchema,
  sandhiSchema,
  varietySchema,
  type Audio,
  type PengimScheme,
  type PojScheme,
  type SandhiTable,
  type Variety,
} from '@teochew/core'
import { externalChartSchema, type ExternalChart } from '../schema/inventory.js'

function readYaml(path: string): unknown {
  return parseYaml(readFileSync(path, 'utf8'))
}

/** Parse with a Zod schema, reporting the offending file when it fails. */
function parseFile<T>(path: string, schema: { parse: (v: unknown) => T }): T {
  try {
    return schema.parse(readYaml(path))
  } catch (err) {
    throw new Error(`invalid phonology file ${path}\n${(err as Error).message}`)
  }
}

/** Parse `path` with `schema`, or throw `notFoundMessage` if it doesn't exist. */
function loadRequiredFile<T>(path: string, schema: { parse: (v: unknown) => T }, notFoundMessage: string): T {
  if (!existsSync(path)) throw new Error(notFoundMessage)
  return parseFile(path, schema)
}

/**
 * Parse `path` with `schema`, or `null` if it doesn't exist. Unlike
 * `loadRequiredFile`, a missing file is expected steady state here, not an
 * error — but a file that exists and fails to parse/validate still throws,
 * so a malformed file is never mistaken for a merely-absent one. Exported
 * (unlike `loadRequiredFile`/`parseFile`) since it's already generic over any
 * `path`/`schema` pair — see `mergeLinguaLibreClip` in
 * `../importers/lingualibre-merge.js`, which needs the same "parse-or-null"
 * behaviour against a test-injectable directory `loadAudioIfExists` can't
 * parameterise.
 */
export function loadOptionalFile<T>(path: string, schema: { parse: (v: unknown) => T }): T | null {
  return existsSync(path) ? parseFile(path, schema) : null
}

export function loadPengimScheme(): PengimScheme {
  return parseFile(join(PHONOLOGY_DIR, 'pengim.yaml'), pengimSchemeSchema)
}

export function loadPojScheme(): PojScheme {
  return parseFile(join(PHONOLOGY_DIR, 'poj.yaml'), pojSchema)
}

export function loadRawVariety(id: string): Variety {
  const path = join(VARIETIES_DIR, `${id}.yaml`)
  return loadRequiredFile(path, varietySchema, `unknown variety '${id}' (no ${path})`)
}

/** The ids of every `.yaml` file directly in `dir`, or `[]` if `dir` doesn't exist. */
function listYamlIds(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => basename(f, '.yaml'))
    .sort()
}

export function listVarieties(): string[] {
  return listYamlIds(VARIETIES_DIR)
}

/**
 * Load a variety with its inheritance chain flattened.
 *
 * Varieties are sparse overlays (Shantou lists only what differs from Chaozhou),
 * which keeps the linguistic diff between them readable. Resolution merges
 * key-by-key from the base upward, so an overlay replaces individual mappings
 * without having to restate the whole table.
 */
export function loadVariety(id: string, seen: string[] = []): Variety {
  if (seen.includes(id)) {
    throw new Error(`circular variety inheritance: ${[...seen, id].join(' → ')}`)
  }
  const own = loadRawVariety(id)
  const parentId = own.variety.inherits
  if (!parentId) return own

  const parent = loadVariety(parentId, [...seen, id])
  return {
    variety: own.variety,
    initials: { ...parent.initials, ...own.initials },
    medials: { ...parent.medials, ...own.medials },
    nuclei: { ...parent.nuclei, ...own.nuclei },
    codas: { ...parent.codas, ...own.codas },
    nasalisation: own.nasalisation ?? parent.nasalisation,
    tones: { ...parent.tones, ...own.tones },
    irregular: { ...parent.irregular, ...own.irregular },
  }
}

export function loadSandhi(id: string): SandhiTable {
  const path = join(SANDHI_DIR, `${id}.yaml`)
  return loadRequiredFile(path, sandhiSchema, `no sandhi table for '${id}' (no ${path})`)
}

export function listSandhiTables(): string[] {
  return listYamlIds(SANDHI_DIR)
}

export function loadExternalChart(id: string): ExternalChart {
  const path = join(EXTERNAL_DIR, `${id}.yaml`)
  return loadRequiredFile(path, externalChartSchema, `no external chart for '${id}' (no ${path})`)
}

export function listExternalCharts(): string[] {
  return listYamlIds(EXTERNAL_DIR)
}

/**
 * Load one variety's audio clip metadata. Deliberately NOT resolved through
 * `loadVariety`'s inheritance chain (unlike IPA/POJ mappings) — a recording
 * cannot be borrowed from a parent variety without misrepresenting the accent
 * it claims to be. See REVIEW.md § 11.
 */
export function loadAudio(id: string): Audio {
  const path = join(AUDIO_METADATA_DIR, `${id}.yaml`)
  return loadRequiredFile(path, audioSchema, `no audio metadata for '${id}' (no ${path})`)
}

/**
 * Same as `loadAudio`, but `null` rather than throwing when the variety has
 * no audio metadata at all — the expected steady state pre-#36, not an error
 * (see `createEnricher`'s `audioFor` in `src/build/enrich.ts`). A file that
 * exists and fails to parse/validate still throws.
 */
export function loadAudioIfExists(id: string): Audio | null {
  return loadOptionalFile(join(AUDIO_METADATA_DIR, `${id}.yaml`), audioSchema)
}

export function listAudioVarieties(): string[] {
  return listYamlIds(AUDIO_METADATA_DIR)
}
