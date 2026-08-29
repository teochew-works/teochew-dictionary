import { PROMPT_MODE_LABELS } from '../flashcards/promptMode'
import type { PromptMode } from '../flashcards/promptMode'

/** A segmented control over native radios, so arrow-key navigation between options is free (built into every browser's radiogroup handling). */
export function PromptModeControl({ mode, onChange }: { mode: PromptMode; onChange: (mode: PromptMode) => void }) {
  return (
    <fieldset className="prompt-mode">
      <legend className="sr-only">Flashcard prompt</legend>
      {Object.entries(PROMPT_MODE_LABELS).map(([value, label]) => (
        <label
          key={value}
          className={mode === value ? 'prompt-mode__option prompt-mode__option--active' : 'prompt-mode__option'}
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
