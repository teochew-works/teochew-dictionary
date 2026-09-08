import { AUDIO_MODE_LABELS } from '../settings/audioMode'
import type { AudioMode } from '../settings/audioMode'

/** A segmented control over native radios, so arrow-key navigation between options is free (built into every browser's radiogroup handling). */
export function AudioModeControl({ mode, onChange }: { mode: AudioMode; onChange: (mode: AudioMode) => void }) {
  return (
    <fieldset className="seg seg--audio-mode">
      <legend className="sr-only">Audio buttons shown</legend>
      {Object.entries(AUDIO_MODE_LABELS).map(([value, label]) => (
        <label
          key={value}
          className={mode === value ? 'seg__option seg__option--on' : 'seg__option'}
        >
          <input
            type="radio"
            name="audio-mode"
            value={value}
            checked={mode === value}
            onChange={() => onChange(value as AudioMode)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
