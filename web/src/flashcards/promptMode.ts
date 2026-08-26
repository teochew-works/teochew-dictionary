import type { EnrichedEntry } from '../types/dict'

export type PromptMode = 'chinese' | 'english' | 'pronunciation' | 'audio-only'

export const PROMPT_MODE_LABELS: Record<PromptMode, string> = {
  chinese: 'Chinese',
  english: 'English',
  pronunciation: 'Pronunciation',
  'audio-only': 'Audio only',
}

export const DEFAULT_PROMPT_MODE: PromptMode = 'chinese'

const PROMPT_MODE_KEY = 'teochew-dictionary:flashcard-prompt-mode'

function isPromptMode(value: string | null): value is PromptMode {
  return value !== null && value in PROMPT_MODE_LABELS
}

export function readPromptMode(): PromptMode {
  try {
    const stored = localStorage.getItem(PROMPT_MODE_KEY)
    return isPromptMode(stored) ? stored : DEFAULT_PROMPT_MODE
  } catch {
    return DEFAULT_PROMPT_MODE
  }
}

export function writePromptMode(mode: PromptMode): void {
  try {
    localStorage.setItem(PROMPT_MODE_KEY, mode)
  } catch {
    // localStorage unavailable — mode still applies this session, just doesn't persist.
  }
}

/**
 * Whether `entry` has what `mode`'s prompt or answer needs. Flashcard only
 * ever displays `readings[0]`, so audio-only checks that reading
 * specifically rather than every reading on the entry.
 */
export function isEligibleForMode(entry: EnrichedEntry, mode: PromptMode): boolean {
  switch (mode) {
    case 'chinese':
      return true
    case 'pronunciation':
      return entry.readings.length > 0
    case 'english':
      return (entry.senses[0]?.gloss_en.length ?? 0) > 0
    case 'audio-only': {
      const r = entry.readings[0]
      return r !== undefined && (r.wordAudio !== null || r.audio.some((c) => c !== null))
    }
  }
}
