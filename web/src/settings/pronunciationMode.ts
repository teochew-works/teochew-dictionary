import { preferenceChanged } from './usePreference'
import { DEFAULT_PRONUNCIATION_MODE, type PronunciationMode } from '@teochew/core'
const PRONUNCIATION_MODE_KEY = 'teochew-dictionary:pronunciation-mode'

function isPronunciationMode(value: string | null): value is PronunciationMode {
  return value === 'citation' || value === 'sandhi'
}

export function readPronunciationMode(): PronunciationMode {
  try {
    const stored = localStorage.getItem(PRONUNCIATION_MODE_KEY)
    return isPronunciationMode(stored) ? stored : DEFAULT_PRONUNCIATION_MODE
  } catch {
    return DEFAULT_PRONUNCIATION_MODE
  }
}

export function writePronunciationMode(mode: PronunciationMode): void {
  try {
    localStorage.setItem(PRONUNCIATION_MODE_KEY, mode)
    preferenceChanged()
  } catch {
    // localStorage unavailable — mode still applies this session, just doesn't persist.
  }
}
