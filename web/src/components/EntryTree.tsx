import { useState } from 'react'
import type { EntryGroup } from '@teochew/core'
import { EntryRow } from './EntryRow'

/**
 * Collapsible grouped list. `isSearching` forces every group open (so search
 * matches are never hidden behind a collapsed group) regardless of the
 * user's manual collapse/expand clicks, which are otherwise remembered.
 */
export function EntryTree({
  groups,
  selectedId,
  onSelect,
  isSearching,
}: {
  groups: EntryGroup[]
  selectedId: string | null
  onSelect: (id: string) => void
  isSearching: boolean
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (groups.length === 0) {
    return <p className="entry-list__empty">No matches.</p>
  }

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="entry-tree">
      {groups.map((group) => {
        const open = isSearching || !collapsed.has(group.key)
        return (
          <div key={group.key} className="entry-tree__group">
            <button type="button" className="entry-tree__summary" aria-expanded={open} onClick={() => toggle(group.key)}>
              <span className="entry-tree__caret" aria-hidden="true">
                {open ? '▾' : '▸'}
              </span>
              <span className="entry-tree__label">{group.label}</span>
              <span className="entry-tree__count">({group.entries.length})</span>
            </button>
            {open && (
              <ul className="entry-list entry-tree__list">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <EntryRow entry={entry} selected={entry.id === selectedId} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
