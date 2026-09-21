import { preferenceChanged } from './usePreference'
import { LEVEL_FILTER_ORDER, DEFAULT_LEVEL_FILTER, type LevelFilterValue } from '@teochew/core'
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
    preferenceChanged()
  } catch {
    // localStorage unavailable — filter still applies this session, just doesn't persist.
  }
}

