import type { DeckGroup } from '../decks/types'

/**
 * Named, saved deck-id sets — "the table" as it was when saved (issue #187
 * stage 4). Naming uses window.prompt rather than a custom form, matching
 * DeckRail's create/rename/delete controls, to keep this additive rather
 * than introducing the first modal-dialog component in the app.
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
  function handleSave() {
    const name = window.prompt('Save the current table as a group named:')
    if (name && name.trim()) onSave(name.trim())
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

      <button type="button" className="group-presets__save" onClick={handleSave} disabled={currentInPlay.length === 0}>
        Save table as group…
      </button>

      {groups.length > 0 && (
        <ul className="group-presets__list">
          {groups.map((group) => (
            <li key={group.id} className="group-presets__item">
              {group.name}
              <button
                type="button"
                className="group-presets__delete"
                aria-label={`Delete group ${group.name}`}
                onClick={() => onDelete(group.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
