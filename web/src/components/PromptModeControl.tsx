import { PROMPT_MODE_LABELS, type PromptMode } from '@teochew/core'

/** A segmented control over native radios, so arrow-key navigation between options is free (built into every browser's radiogroup handling). */
export function PromptModeControl({ mode, onChange }: { mode: PromptMode; onChange: (mode: PromptMode) => void }) {
  return (
    <fieldset className="seg seg--prompt">
      <legend className="sr-only">Flashcard prompt</legend>
      {Object.entries(PROMPT_MODE_LABELS).map(([value, label]) => (
        <label
          key={value}
          className={mode === value ? 'seg__option seg__option--on' : 'seg__option'}
        >
          <input
            type="radio"
            name="prompt-mode"
            value={value}
            checked={mode === value}
            onChange={() => onChange(value as PromptMode)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
