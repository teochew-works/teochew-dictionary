import { useState } from 'react'
import type { Deck, DeckGroup } from '@teochew/core'

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')
}

/**
 * Saved tables. A combination worth repeating — Core 100 + Kitchen +
 * the dictionary — saves as a group and reloads in one click, with the
 * deck hues carried onto the pill so a group is recognisable before its
 * name is read.
 *
 * Naming is an inline input rather than `window.prompt` (issue #189), the
 * same pattern deck rename uses; loading and deleting are both undoable
 * from the toast they raise, so neither needs a confirmation step.
 */
export function GroupPresets({
  groups,
  decksById,
  currentInPlay,
  onSave,
  onLoad,
  onDelete,
}: {
  groups: DeckGroup[]
  decksById: Map<string, Deck>
  currentInPlay: string[]
  onSave: (name: string) => void
  onLoad: (groupId: string) => void
  onDelete: (groupId: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [value, setValue] = useState('')

  function commit() {
    if (value.trim()) onSave(value.trim())
    setSaving(false)
    setValue('')
  }

  function cancel() {
    setSaving(false)
    setValue('')
  }

  return (
    <div className="groups">
      {groups.map((group) => {
        const on = sameSet(group.deckIds, currentInPlay)
        const names = group.deckIds.map((id) => decksById.get(id)?.name ?? '?').join(' + ')
        return (
          <span key={group.id} className={on ? 'group group--on' : 'group'}>
            <button type="button" className="group__load" aria-pressed={on} title={names} onClick={() => onLoad(group.id)}>
              <span className="group__swatches" aria-hidden="true">
                {group.deckIds.map((id) => {
                  const deck = decksById.get(id)
                  return deck ? <i key={id} style={{ background: `var(--deck-hue-${deck.hue}-bg)` }} /> : null
                })}
              </span>
              <span>{group.name}</span>
            </button>
            <button type="button" className="group__delete" aria-label={`Delete group ${group.name}`} onClick={() => onDelete(group.id)}>
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                <path d="M1.3 1.3l5.4 5.4M6.7 1.3L1.3 6.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        )
      })}

      {saving ? (
        <input
          className="group__save-input"
          aria-label="Name this group"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
        />
      ) : (
        <button type="button" className="group__save" disabled={currentInPlay.length === 0} onClick={() => setSaving(true)}>
          + Save this table
        </button>
      )}
    </div>
  )
}
