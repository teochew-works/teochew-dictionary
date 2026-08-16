import type { EnrichedEntry } from '../types/dict'

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
      {entries.map((entry) => {
        const reading = entry.readings[0]
        const gloss = entry.senses[0]?.gloss_en.join(', ')
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={entry.id === selectedId ? 'entry-list__item entry-list__item--selected' : 'entry-list__item'}
              onClick={() => onSelect(entry.id)}
            >
              <span className="entry-list__headword">{entry.headword}</span>
              {reading && <span className="entry-list__pengim">{reading.pengim}</span>}
              {gloss && <span className="entry-list__gloss">{gloss}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
