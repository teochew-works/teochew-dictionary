import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root, resolved from this module's own location (src/paths.ts). */
export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export const DATA_DIR = join(ROOT, 'data')
export const ENTRIES_DIR = join(DATA_DIR, 'entries')
export const PHONOLOGY_DIR = join(DATA_DIR, 'phonology')
export const VARIETIES_DIR = join(PHONOLOGY_DIR, 'varieties')
export const SANDHI_DIR = join(PHONOLOGY_DIR, 'sandhi')
export const EXTERNAL_DIR = join(PHONOLOGY_DIR, 'external')
export const LEARNTEOCHEW_CHART_FILE = join(EXTERNAL_DIR, 'learnteochew.yaml')
export const SOURCES_FILE = join(DATA_DIR, 'sources.yaml')
export const WORDLISTS_DIR = join(DATA_DIR, 'wordlists')
export const SYLLABLE_INVENTORY_FILE = join(WORDLISTS_DIR, 'syllable-inventory.yaml')
export const DIST_DIR = join(ROOT, 'dist')
