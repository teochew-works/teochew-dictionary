import type { EnrichedReading } from '../enrichedEntry.js'

/** One of the four pronunciation forms a reading can show. */
export type PronunciationField = 'pengim' | 'ipa' | 'poj' | 'sandhi'

export const PRONUNCIATION_FIELDS: PronunciationField[] = ['pengim', 'ipa', 'poj', 'sandhi']

export const PRONUNCIATION_FIELD_LABELS: Record<PronunciationField, string> = {
  pengim: "Peng'im",
  ipa: 'IPA',
  poj: 'POJ',
  sandhi: 'Sandhi',
}

export const DEFAULT_PRONUNCIATION_DISPLAY: PronunciationField[] = ['pengim', 'ipa', 'poj', 'sandhi']

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
  } catch {
    // localStorage unavailable — the choice still applies this session, just doesn't persist.
  }
}

/**
 * `fields`, filtered to what's actually worth rendering for this reading —
 * `sandhi` is dropped when it's identical to the citation form, since there's
 * nothing distinct to show.
 */
export function visiblePronunciationFields(
  reading: Pick<EnrichedReading, 'pengim' | 'sandhi'>,
  fields: PronunciationField[],
): PronunciationField[] {
  return fields.filter((field) => field !== 'sandhi' || reading.sandhi !== reading.pengim)
}
