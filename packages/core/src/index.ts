// Public entry point for @teochew/core (ADR-0002).
//
// Kept as one flat re-export surface for now rather than a subpath-export
// system — see README.md.

export * from './schema/entry.js'
export * from './schema/phonology.js'
export * from './enrichedEntry.js'
export * from './textNormalize.js'

export * from './phonology/syllable.js'
export * from './phonology/ipa.js'
export * from './phonology/poj.js'
export * from './phonology/sandhi.js'
export * from './phonology/rime-order.js'

export * from './srs/types.js'
export * from './srs/scheduler.js'

export * from './decks/types.js'
export * from './decks/pipeline.js'

export * from './search/filters.js'
export * from './search/sortEntries.js'

export * from './flashcards/promptMode.js'
export * from './flashcards/levelFilter.js'

export * from './settings/pronunciationMode.js'
