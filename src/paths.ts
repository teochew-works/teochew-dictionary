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
/**
 * Per-variety audio clip metadata (issue #31): `{id}.yaml`. The clip bytes
 * themselves live on GitHub Releases, not in this repo — see
 * `data/phonology/REVIEW.md` § 12.
 */
export const AUDIO_METADATA_DIR = join(PHONOLOGY_DIR, 'audio')
export const SOURCES_FILE = join(DATA_DIR, 'sources.yaml')
export const WORDLISTS_DIR = join(DATA_DIR, 'wordlists')
export const SYLLABLE_INVENTORY_FILE = join(WORDLISTS_DIR, 'syllable-inventory.yaml')
export const WIKTIONARY_WORDLIST_FILE = join(WORDLISTS_DIR, 'wiktionary-teochew-index.yaml')
export const STARTER_DECKS_FILE = join(WORDLISTS_DIR, 'starter-decks.yaml')
export const DIST_DIR = join(ROOT, 'dist')

/**
 * Scratch space for anything fetched from a live site that is neither part of
 * the dataset nor a build artifact. Gitignored, and safe to delete wholesale —
 * every command that writes here can refetch what it lost.
 */
export const CACHE_DIR = join(ROOT, '.cache')
/** Raw Wiktionary wikitext, one file per headword (issue #79). */
export const WIKTIONARY_PAGE_CACHE_DIR = join(CACHE_DIR, 'wiktionary-pages')
/** Trimmed wiktextract dump, keyed by headword (issue #84). Populated manually — see README. */
export const WIKTEXTRACT_MIN_FILE = join(CACHE_DIR, 'teochew-relevant.min.jsonl')
/**
 * Published clip bytes, one `<sha256>.webm` per manifest checksum (issue
 * #259). Filled by `npm run audio:grade` and read by everything downstream of
 * it, so a grade or synthesis run over the whole corpus is one download, not
 * one per run — and `audio:synthesize` needs no network at all.
 */
export const AUDIO_CLIP_CACHE_DIR = join(CACHE_DIR, 'audio-clips')
/** Per-clip features keyed by bare sha256 hex — see `src/audio/features.ts`. */
export const AUDIO_FEATURES_FILE = join(CACHE_DIR, 'audio-features.json')

/** The Python DSP tool `src/audio/` drives — see tools/resynth/README.md. */
export const RESYNTH_TOOL_DIR = join(ROOT, 'tools', 'resynth')
