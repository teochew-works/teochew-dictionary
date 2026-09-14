import type { EnrichedEntry, EnrichedReading, ResolvedEntry, ResolvedReading } from '@teochew/core'

/**
 * Shared base fixtures for the search/sort/component test suites (see
 * sortEntries.test.ts, searchIndex.test.ts, EntryTree.test.tsx,
 * EntryDetail.test.tsx) — each needs a minimal-but-valid ResolvedEntry/
 * ResolvedReading (the single-clip-per-slot shape every component downstream
 * of resolveEntryAudio actually renders) and layers its own overrides on top
 * rather than hand-rolling the full shape again. `DictionaryView`/
 * `FlashcardsView` take the raw (candidate-list) `EnrichedEntry` shape
 * instead — see `toRawEntry` below, or DictionaryView.test.tsx's own
 * from-scratch raw fixtures where a test needs fine control over which
 * candidate wins.
 */
export function makeReading(overrides: Partial<ResolvedReading> = {}): ResolvedReading {
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
    sandhiAudio: [null, null],
    wordAudio: null,
    ...overrides,
  }
}

export function makeEntry(overrides: Partial<ResolvedEntry> = {}): ResolvedEntry {
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

/**
 * `reading`/`entry`, re-shaped from resolveEntryAudio's single-clip-per-slot
 * output back to the raw one-candidate-per-slot shape `DictionaryView`/
 * `FlashcardsView` actually take as props — the inverse of resolveEntryAudio
 * with an empty preference. Lets tests write overrides against the familiar
 * `makeReading`/`makeEntry` shape and only convert at the prop boundary.
 */
export function toRawReading(reading: ResolvedReading): EnrichedReading {
  return {
    ...reading,
    audio: reading.audio.map((c) => (c ? [c] : [])),
    sandhiAudio: reading.sandhiAudio.map((c) => (c ? [c] : [])),
    wordAudio: reading.wordAudio ? [reading.wordAudio] : [],
  }
}

export function toRawEntry(entry: ResolvedEntry): EnrichedEntry {
  return { ...entry, readings: entry.readings.map(toRawReading) }
}
