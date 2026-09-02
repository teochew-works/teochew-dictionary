import type { EnrichedEntry } from '../enrichedEntry.js'
import type { Level } from '../schema/entry.js'
import { LEVEL_ORDER } from '../search/sortEntries.js'

export type LevelFilterValue = Level | 'untiered'

export const LEVEL_FILTER_ORDER: LevelFilterValue[] = [...LEVEL_ORDER, 'untiered']

export function levelFilterLabel(value: LevelFilterValue): string {
  return value === 'untiered' ? 'Untiered' : value
}

export const DEFAULT_LEVEL_FILTER: Set<LevelFilterValue> = new Set(LEVEL_FILTER_ORDER)

const LEVEL_FILTER_KEY = 'teochew-dictionary:flashcard-level-filter'

function isLevelFilterValue(token: string): token is LevelFilterValue {
  return (LEVEL_FILTER_ORDER as string[]).includes(token)
}

export function readLevelFilter(): Set<LevelFilterValue> {
  try {
    const stored = localStorage.getItem(LEVEL_FILTER_KEY)
    if (stored === null) return new Set(DEFAULT_LEVEL_FILTER)
    if (stored === '') return new Set()
    const tokens = stored.split(',')
    return tokens.every(isLevelFilterValue) ? new Set(tokens) : new Set(DEFAULT_LEVEL_FILTER)
  } catch {
    return new Set(DEFAULT_LEVEL_FILTER)
  }
}

export function writeLevelFilter(selected: Set<LevelFilterValue>): void {
  try {
    localStorage.setItem(LEVEL_FILTER_KEY, LEVEL_FILTER_ORDER.filter((v) => selected.has(v)).join(','))
  } catch {
    // localStorage unavailable — filter still applies this session, just doesn't persist.
  }
}

export function isEligibleForLevel(entry: EnrichedEntry, selected: Set<LevelFilterValue>): boolean {
  return entry.level ? selected.has(entry.level) : selected.has('untiered')
}
