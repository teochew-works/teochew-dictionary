import { useMemo, useState } from 'react'
import { createSearchIndex, search } from '../search/searchIndex'
import { groupEntries, sortFlat } from '../search/sortEntries'
import type { SortMode, ToneSource } from '../search/sortEntries'
import { EntryList } from '../components/EntryList'
import { EntryTree } from '../components/EntryTree'
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

const SORT_MODE_LABELS: Record<SortMode, string> = {
  headword: 'Headword',
  english: 'English',
  tone: 'Tone',
  category: 'Category',
  level: 'Level',
}

export function DictionaryView({ entries }: { entries: EnrichedEntry[] }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showLicence, setShowLicence] = useState(readShowLicence)
  const [sortMode, setSortMode] = useState<SortMode>('headword')
  const [toneSource, setToneSource] = useState<ToneSource>('citation')

  const index = useMemo(() => createSearchIndex(entries), [entries])
  const isSearching = query.trim() !== ''
  const results = useMemo(
    () => (isSearching ? search(index, query) : entries),
    [index, query, entries, isSearching],
  )

  const isFlat = sortMode === 'headword' || sortMode === 'english'
  const sortedEntries = useMemo(() => (isFlat ? sortFlat(results, sortMode) : []), [results, sortMode, isFlat])
  const groups = useMemo(
    () => (isFlat ? [] : groupEntries(results, sortMode, toneSource)),
    [results, sortMode, toneSource, isFlat],
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
        <div className="dictionary-view__controls">
          <select
            className="dictionary-view__sort"
            aria-label="Sort dictionary by"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            {Object.entries(SORT_MODE_LABELS).map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </select>
          {sortMode === 'tone' && (
            <select
              className="dictionary-view__tone-source"
              aria-label="Tone type"
              value={toneSource}
              onChange={(e) => setToneSource(e.target.value as ToneSource)}
            >
              <option value="citation">Citation tone</option>
              <option value="sandhi">Sandhi tone</option>
            </select>
          )}
        </div>
        {isFlat ? (
          <EntryList entries={sortedEntries} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
          <EntryTree groups={groups} selectedId={selectedId} onSelect={setSelectedId} isSearching={isSearching} />
        )}
      </div>
      <div className="dictionary-view__detail-pane">
        {selected ? (
          // Keyed so selecting another entry remounts the pane: EntryDetail
          // owns the audio player, and a clip should stop when the user
          // navigates away from the entry it belongs to.
          <EntryDetail key={selected.id} entry={selected} showLicence={showLicence} />
        ) : (
          <div className="dictionary-view__empty-state">
            <ruby className="dictionary-view__empty-state-headline" aria-hidden="true">
              食<rt>ziah</rt>
              茶<rt>de</rt>
              学<rt>oh</rt>
              字<rt>zi</rt>
            </ruby>
            <p className="dictionary-view__empty-state-tagline" aria-hidden="true">
              your teochew dictionary
            </p>
            <span className="sr-only">Select an entry to see its details.</span>
          </div>
        )}
      </div>
    </div>
  )
}
