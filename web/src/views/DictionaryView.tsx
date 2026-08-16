import { useMemo, useState } from 'react'
import { createSearchIndex, search } from '../search/searchIndex'
import { EntryList } from '../components/EntryList'
import { EntryDetail } from '../components/EntryDetail'
import type { EnrichedEntry } from '../types/dict'
import './DictionaryView.css'

export function DictionaryView({ entries }: { entries: EnrichedEntry[] }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const index = useMemo(() => createSearchIndex(entries), [entries])
  const results = useMemo(
    () => (query.trim() ? search(index, query) : entries),
    [index, query, entries],
  )

  const selected = results.find((e) => e.id === selectedId) ?? entries.find((e) => e.id === selectedId) ?? null

  return (
    <div className="dictionary-view">
      <div className="dictionary-view__list-pane">
        <input
          type="search"
          className="dictionary-view__search"
          placeholder="Search headword, Peng'im, POJ, or English…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the dictionary"
        />
        <EntryList entries={results} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="dictionary-view__detail-pane">
        {selected ? (
          <EntryDetail entry={selected} />
        ) : (
          <p className="dictionary-view__placeholder">Select an entry to see its details.</p>
        )}
      </div>
    </div>
  )
}
