import type { EnrichedEntry, EnrichedReading } from '../types/dict'

/**
 * Shared base fixtures for the search/sort/component/view test suites (see
 * sortEntries.test.ts, searchIndex.test.ts, EntryTree.test.tsx,
 * DictionaryView.test.tsx) — each needs a minimal-but-valid EnrichedEntry/
 * EnrichedReading and layers its own overrides on top rather than
 * hand-rolling the full shape again.
 */
export function makeReading(overrides: Partial<EnrichedReading> = {}): EnrichedReading {
  return {
    pengim: 'dio5 ziu1',
    variety: 'chaozhou',
    ipa: 'tie⁵⁵ tsiu³³',
    poj: 'tiô-tsiu',
    sandhi: 'dio7 ziu1',
    ipa_confidence: 'medium',
    ipa_caveats: [],
    pengim_toneless: 'dio ziu',
    syllable_count: 2,
    audio: [null, null],
    wordAudio: null,
    ...overrides,
  }
}

export function makeEntry(overrides: Partial<EnrichedEntry> = {}): EnrichedEntry {
  return {
    id: 'dio5-ziu1-潮州',
    headword: '潮州',
    readings: [makeReading()],
    senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
    sources: ['seed'],
    search_keys: ['潮州', 'dio5 ziu1'],
    licence: 'CC-BY-4.0',
    attributions: [],
    ...overrides,
  }
}
