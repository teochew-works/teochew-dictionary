// Public entry point for @teochew/core (ADR-0002).
//
// Kept as one flat re-export surface for now rather than a subpath-export
// system — see README.md.

export * from './schema/entry.js'
export * from './schema/phonology.js'
export * from './enrichedEntry.js'

export * from './phonology/syllable.js'
export * from './phonology/ipa.js'
export * from './phonology/poj.js'
export * from './phonology/sandhi.js'
export * from './phonology/rime-order.js'
