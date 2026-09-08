export type AudioMode = 'component' | 'combined' | 'both'

export const AUDIO_MODE_LABELS: Record<AudioMode, string> = {
  component: 'Component',
  combined: 'Combined',
  both: 'Both',
}

// Existing behavior is component-only buttons; 'both' additionally offers
// combined playback wherever it's available, without hiding anything users
// already see — no visual regression for anyone who never touches this.
export const DEFAULT_AUDIO_MODE: AudioMode = 'both'

const AUDIO_MODE_KEY = 'teochew-dictionary:audio-mode'

function isAudioMode(value: string | null): value is AudioMode {
  return value !== null && value in AUDIO_MODE_LABELS
}

export function readAudioMode(): AudioMode {
  try {
    const stored = localStorage.getItem(AUDIO_MODE_KEY)
    return isAudioMode(stored) ? stored : DEFAULT_AUDIO_MODE
  } catch {
    return DEFAULT_AUDIO_MODE
  }
}

export function writeAudioMode(mode: AudioMode): void {
  try {
    localStorage.setItem(AUDIO_MODE_KEY, mode)
  } catch {
    // localStorage unavailable — mode still applies this session, just doesn't persist.
  }
}
