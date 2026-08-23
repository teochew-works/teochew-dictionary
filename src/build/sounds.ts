import type { LoadedEntry } from '../data/load.js'
import { loadPengimScheme } from '../phonology/load.js'
import {
  buildAttestationCounts,
  buildAttestationIndex,
  buildSandhiAttestationCounts,
} from '../phonology/inventory.js'
import { toIpa } from '../phonology/ipa.js'
import { parsePengim } from '../phonology/syllable.js'
import type { Entry } from '../schema/entry.js'
import type { PengimScheme } from '../schema/phonology.js'

/**
 * Every distinct Peng'im syllable ("sound") actually spoken by a headword's
 * Chaozhou reading, paired with up to 3 example words — the data behind the
 * web UI's Sounds tab (issue #124). Reuses `buildAttestationIndex` (the same
 * attestation logic `npm run inventory` uses for syllable-inventory.yaml)
 * rather than re-deriving it, and `toIpa` for the same compositional IPA the
 * rest of the build already produces.
 *
 * Examples are scoped to citation-form Chaozhou readings only, not
 * tone-sandhi surface forms: a sandhi surface syllable doesn't have a
 * headword of its own to show as an example. `occurrences` (issue #129) is
 * not scoped that way — it also folds in sandhi surface attestation, so a
 * sandhi-only syllable can still surface with a nonzero count and no
 * examples.
 */

export const SOUNDS_VARIETY = 'chaozhou'
const MAX_EXAMPLES = 3

export interface SoundExample {
  headword: string
  pengim: string
  gloss: string
}

export interface Sound {
  pengim: string
  ipa: string
  /**
   * Dictionary-wide occurrence count: citation-form occurrences plus
   * tone-sandhi surface occurrences, summed (issue #129). Distinct from
   * `Entry.frequency`, a hand-curated per-headword curriculum-commonness
   * band — this is a corpus-derived, per-syllable raw count.
   */
  occurrences: number
  examples: SoundExample[]
}

export interface SoundsData {
  variety: string
  sounds: Sound[]
}

/** The specific reading of `entry` whose Peng'im contains `syllableRaw`, verbatim. */
function pickReadingPengim(entry: Entry, syllableRaw: string, scheme: PengimScheme): string | null {
  for (const reading of entry.readings) {
    if (reading.variety !== SOUNDS_VARIETY) continue
    if (parsePengim(reading.pengim, scheme).some((s) => s.raw === syllableRaw)) return reading.pengim
  }
  return null
}

/**
 * Shorter (ideally monosyllabic) readings demonstrate a sound most directly;
 * among those, higher-frequency words make more recognisable examples.
 */
function compareExampleCandidates(
  a: { entry: Entry; pengim: string },
  b: { entry: Entry; pengim: string },
): number {
  const aCount = a.pengim.trim().split(/\s+/u).length
  const bCount = b.pengim.trim().split(/\s+/u).length
  if (aCount !== bCount) return aCount - bCount
  const aFreq = a.entry.frequency ?? 0
  const bFreq = b.entry.frequency ?? 0
  if (aFreq !== bFreq) return bFreq - aFreq
  return a.entry.headword.localeCompare(b.entry.headword, 'zh')
}

export function buildSounds(loaded: LoadedEntry[], scheme: PengimScheme = loadPengimScheme()): SoundsData {
  const byId = new Map(loaded.map(({ entry }) => [entry.id, entry]))
  const attestation = buildAttestationIndex(loaded, scheme)
  const citationCounts = buildAttestationCounts(loaded, scheme)
  const sandhiCounts = buildSandhiAttestationCounts(loaded, scheme)

  // A syllable only ever attested via sandhi (never as a citation form) has
  // no entry in `attestation` and so no examples to show — but it still
  // needs a Sound row to carry its occurrence count, so this loop covers the
  // union of both count maps' keys rather than just `attestation`'s.
  const syllableRaws = new Set([...citationCounts.keys(), ...sandhiCounts.keys()])

  const sounds: Sound[] = []
  for (const syllableRaw of syllableRaws) {
    const occurrences =
      (citationCounts.get(syllableRaw)?.get(SOUNDS_VARIETY) ?? 0) +
      (sandhiCounts.get(syllableRaw)?.get(SOUNDS_VARIETY) ?? 0)
    if (occurrences === 0) continue

    // Hidden entries never surface in the web UI (see useDictionary's
    // filtering) — excluded here too, so the Sounds tab can't leak one in as
    // an example. The sound itself still counts as attested either way.
    const ids = attestation.get(syllableRaw)?.get(SOUNDS_VARIETY)
    const candidates = [...(ids ?? [])]
      .map((id) => byId.get(id)!)
      .filter((entry) => !entry.hidden)
      .map((entry) => ({ entry, pengim: pickReadingPengim(entry, syllableRaw, scheme)! }))
      .sort(compareExampleCandidates)

    const examples = candidates.slice(0, MAX_EXAMPLES).map(({ entry, pengim }) => ({
      headword: entry.headword,
      pengim,
      gloss: entry.senses[0]?.gloss_en[0] ?? '',
    }))

    sounds.push({ pengim: syllableRaw, ipa: toIpa(syllableRaw, SOUNDS_VARIETY).ipa, occurrences, examples })
  }

  // Plain code-point order, not localeCompare: ICU collation treats `ê` as a
  // diacritic variant of `e` and compares whole-string primary weights before
  // diacritics, which interleaves the two initials (e1, e2, ê2, e3, ê3, ...)
  // instead of keeping each contiguous — and SoundsView's grouping-by-initial
  // depends on that contiguity.
  sounds.sort((a, b) => (a.pengim < b.pengim ? -1 : a.pengim > b.pengim ? 1 : 0))
  return { variety: SOUNDS_VARIETY, sounds }
}
