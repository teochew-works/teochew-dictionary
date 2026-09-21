import { preferenceChanged } from './usePreference'
import { PROMPT_MODE_LABELS, DEFAULT_PROMPT_MODE, type PromptMode } from '@teochew/core'
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
    preferenceChanged()
  } catch {
    // localStorage unavailable — mode still applies this session, just doesn't persist.
  }
}

