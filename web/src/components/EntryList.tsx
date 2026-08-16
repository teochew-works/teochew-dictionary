import type { EnrichedEntry } from '../types/dict'
import { EntryRow } from './EntryRow'

export function EntryList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: EnrichedEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (entries.length === 0) {
    return <p className="entry-list__empty">No matches.</p>
  }

  return (
    <ul className="entry-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <EntryRow entry={entry} selected={entry.id === selectedId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  )
}
