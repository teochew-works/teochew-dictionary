import { useMemo, useState } from 'react'
import { createSearchIndex, search } from '../search/searchIndex'
import { EntryList } from '../components/EntryList'
import { EntryDetail } from '../components/EntryDetail'
import type { EnrichedEntry } from '../types/dict'
import './DictionaryView.css'

const SHOW_LICENCE_KEY = 'teochew-dictionary:show-licence'

function readShowLicence(): boolean {
  try {
    return localStorage.getItem(SHOW_LICENCE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeShowLicence(value: boolean): void {
  try {
    localStorage.setItem(SHOW_LICENCE_KEY, String(value))
  } catch {
    // localStorage unavailable (e.g. private browsing) — toggle still works, just doesn't persist.
  }
}

export function DictionaryView({ entries }: { entries: EnrichedEntry[] }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showLicence, setShowLicence] = useState(readShowLicence)

  const index = useMemo(() => createSearchIndex(entries), [entries])
  const results = useMemo(
    () => (query.trim() ? search(index, query) : entries),
    [index, query, entries],
  )

  const selected = results.find((e) => e.id === selectedId) ?? entries.find((e) => e.id === selectedId) ?? null

  const toggleShowLicence = (value: boolean) => {
    setShowLicence(value)
    writeShowLicence(value)
  }

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
        <label className="dictionary-view__licence-toggle">
          <input
            type="checkbox"
            checked={showLicence}
            onChange={(e) => toggleShowLicence(e.target.checked)}
          />
          Show licensing info
        </label>
        <EntryList entries={results} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="dictionary-view__detail-pane">
        {selected ? (
          <EntryDetail entry={selected} showLicence={showLicence} />
        ) : (
          <p className="dictionary-view__placeholder">Select an entry to see its details.</p>
        )}
      </div>
    </div>
  )
}
