import { useState } from 'react'
import { DeleteConfirm } from './DeleteConfirm'
import type { DeckGroup } from '../decks/types'

/**
 * Named, saved deck-id sets — "the table" as it was when saved (issue #187
 * stage 4). Naming is an inline input swapped in for the "Save table as
 * group…" button (issue #189), the same pattern DeckRail's rename and
 * create controls use; deleting a group uses DeleteConfirm, the same small
 * non-modal confirmation deck deletion uses — this stays additive rather
 * than introducing a general-purpose modal-dialog component.
 */
export function GroupPresets({
  groups,
  currentInPlay,
  onSave,
  onLoad,
  onDelete,
}: {
  groups: DeckGroup[]
  currentInPlay: string[]
  onSave: (name: string) => void
  onLoad: (groupId: string) => void
  onDelete: (groupId: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [saveValue, setSaveValue] = useState('')

  function commitSave() {
    if (saveValue.trim()) onSave(saveValue.trim())
    setSaving(false)
    setSaveValue('')
  }

  return (
    <div className="group-presets">
      <select
        className="group-presets__load"
        aria-label="Load a saved group"
        value=""
        disabled={groups.length === 0}
        onChange={(e) => {
          if (e.target.value) onLoad(e.target.value)
        }}
      >
        <option value="" disabled>
          {groups.length === 0 ? 'No saved groups' : 'Load a group…'}
        </option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>

      {saving ? (
        <input
          className="group-presets__save-input"
          aria-label="Name this group"
          value={saveValue}
          autoFocus
          onChange={(e) => setSaveValue(e.target.value)}
          onBlur={commitSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitSave()
            if (e.key === 'Escape') {
              setSaving(false)
              setSaveValue('')
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="group-presets__save"
          onClick={() => setSaving(true)}
          disabled={currentInPlay.length === 0}
        >
          Save table as group…
        </button>
      )}

      {groups.length > 0 && (
        <ul className="group-presets__list">
          {groups.map((group) => (
            <li key={group.id} className="group-presets__item">
              {group.name}
              <DeleteConfirm label={`group ${group.name}`} onConfirm={() => onDelete(group.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
