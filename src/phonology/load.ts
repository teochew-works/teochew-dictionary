import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { EXTERNAL_DIR, PHONOLOGY_DIR, SANDHI_DIR, VARIETIES_DIR } from '../paths.js'
import {
  pengimSchemeSchema,
  pojSchema,
  sandhiSchema,
  varietySchema,
  type PengimScheme,
  type PojScheme,
  type SandhiTable,
  type Variety,
} from '../schema/phonology.js'
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

export function loadPengimScheme(): PengimScheme {
  return parseFile(join(PHONOLOGY_DIR, 'pengim.yaml'), pengimSchemeSchema)
}

export function loadPojScheme(): PojScheme {
  return parseFile(join(PHONOLOGY_DIR, 'poj.yaml'), pojSchema)
}

export function loadRawVariety(id: string): Variety {
  const path = join(VARIETIES_DIR, `${id}.yaml`)
  if (!existsSync(path)) throw new Error(`unknown variety '${id}' (no ${path})`)
  return parseFile(path, varietySchema)
}

export function listVarieties(): string[] {
  return readdirSync(VARIETIES_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => basename(f, '.yaml'))
    .sort()
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
  if (!existsSync(path)) throw new Error(`no sandhi table for '${id}' (no ${path})`)
  return parseFile(path, sandhiSchema)
}

export function listSandhiTables(): string[] {
  return readdirSync(SANDHI_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => basename(f, '.yaml'))
    .sort()
}

export function loadExternalChart(id: string): ExternalChart {
  const path = join(EXTERNAL_DIR, `${id}.yaml`)
  if (!existsSync(path)) throw new Error(`no external chart for '${id}' (no ${path})`)
  return parseFile(path, externalChartSchema)
}

export function listExternalCharts(): string[] {
  if (!existsSync(EXTERNAL_DIR)) return []
  return readdirSync(EXTERNAL_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => basename(f, '.yaml'))
    .sort()
}
