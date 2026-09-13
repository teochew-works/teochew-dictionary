import type { AttestedTriple } from '@teochew/core'
import { buildSounds, type Sound } from '../build/sounds.js'
import { loadEntries } from '../data/load.js'

/**
 * The attested `(initial, rime, tone)` triple table `combineAxes` (issue
 * #280) scores against — one row per syllable `buildSounds` already treats
 * as attested (citation form or tone-sandhi surface form), reusing that
 * rather than re-deriving attestation from `syllable-inventory.yaml` by
 * hand. Node-side only: `buildSounds`/`loadEntries` read the dataset off
 * disk, so the browser instead derives the same table from
 * `dist/sounds.json`'s already-shipped `Sound[]` (`web/public/data/sounds.json`,
 * synced by `web/scripts/sync-data.mjs`) — same shape, same source data,
 * just fetched instead of built.
 */
export function attestedTriples(sounds: Sound[] = buildSounds(loadEntries()).sounds): AttestedTriple[] {
  return sounds.map((s) => ({ syllable: s.pengim, initial: s.initial ?? '', rime: s.rime, tone: s.tone }))
}
