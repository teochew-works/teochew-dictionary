import { preferenceChanged } from './usePreference'
import { PRONUNCIATION_FIELDS, DEFAULT_PRONUNCIATION_DISPLAY, type PronunciationField } from '@teochew/core'
const PRONUNCIATION_DISPLAY_KEY = 'teochew-dictionary:pronunciation-display'

function isPronunciationField(value: unknown): value is PronunciationField {
  return typeof value === 'string' && (PRONUNCIATION_FIELDS as string[]).includes(value)
}

function isPronunciationDisplay(value: unknown): value is PronunciationField[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isPronunciationField) &&
    new Set(value).size === value.length
  )
}

export function readPronunciationDisplay(): PronunciationField[] {
  try {
    const stored = localStorage.getItem(PRONUNCIATION_DISPLAY_KEY)
    if (!stored) return DEFAULT_PRONUNCIATION_DISPLAY
    const parsed: unknown = JSON.parse(stored)
    return isPronunciationDisplay(parsed) ? parsed : DEFAULT_PRONUNCIATION_DISPLAY
  } catch {
    return DEFAULT_PRONUNCIATION_DISPLAY
  }
}

export function writePronunciationDisplay(fields: PronunciationField[]): void {
  try {
    localStorage.setItem(PRONUNCIATION_DISPLAY_KEY, JSON.stringify(fields))
    preferenceChanged()
  } catch {
    // localStorage unavailable — the choice still applies this session, just doesn't persist.
  }
}

