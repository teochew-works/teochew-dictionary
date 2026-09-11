import { PRONUNCIATION_FIELDS, PRONUNCIATION_FIELD_LABELS } from '@teochew/core'
import type { PronunciationField } from '@teochew/core'

/**
 * An ordered, non-empty subset of the four pronunciation fields. No drag —
 * plain ↑/↓ buttons move a selected field within the list, and buttons below
 * re-add any excluded field to the end.
 */
export function PronunciationDisplayControl({
  fields,
  onChange,
}: {
  fields: PronunciationField[]
  onChange: (fields: PronunciationField[]) => void
}) {
  const excluded = PRONUNCIATION_FIELDS.filter((field) => !fields.includes(field))

  function swap(a: number, b: number) {
    const next = [...fields]
    const temp = next[a]!
    next[a] = next[b]!
    next[b] = temp
    onChange(next)
  }

  function moveUp(index: number) {
    if (index === 0) return
    swap(index - 1, index)
  }

  function moveDown(index: number) {
    if (index === fields.length - 1) return
    swap(index, index + 1)
  }

  function remove(field: PronunciationField) {
    if (fields.length <= 1) return
    onChange(fields.filter((f) => f !== field))
  }

  function add(field: PronunciationField) {
    onChange([...fields, field])
  }

  return (
    <div className="pronunciation-display">
      <ul className="pronunciation-display__list">
        {fields.map((field, index) => (
          <li key={field} className="pronunciation-display__item">
            <span className="pronunciation-display__label">{PRONUNCIATION_FIELD_LABELS[field]}</span>
            <button
              type="button"
              className="pronunciation-display__move"
              onClick={() => moveUp(index)}
              disabled={index === 0}
              aria-label={`Move ${PRONUNCIATION_FIELD_LABELS[field]} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="pronunciation-display__move"
              onClick={() => moveDown(index)}
              disabled={index === fields.length - 1}
              aria-label={`Move ${PRONUNCIATION_FIELD_LABELS[field]} down`}
            >
              ↓
            </button>
            <button
              type="button"
              className="pronunciation-display__remove"
              onClick={() => remove(field)}
              disabled={fields.length <= 1}
              aria-label={`Remove ${PRONUNCIATION_FIELD_LABELS[field]}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {excluded.length > 0 && (
        <div className="pronunciation-display__add">
          {excluded.map((field) => (
            <button
              type="button"
              key={field}
              className="settings-view__button"
              onClick={() => add(field)}
            >
              + {PRONUNCIATION_FIELD_LABELS[field]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
