import { useMemo, useState } from 'react'
import { createSearchIndex, search } from '../search/searchIndex'
import { groupEntries, isGrouped, sortFlat } from '../search/sortEntries'
import type { SortMode } from '../search/sortEntries'
import { hasAudio, hasFullAudio } from '../search/filters'
import { readShowLicence, writeShowLicence } from '../settings/showLicence'
import { readAudioOnly, writeAudioOnly } from '../settings/audioOnly'
import { readFullAudioOnly, writeFullAudioOnly } from '../settings/fullAudioOnly'
import { readPronunciationMode, writePronunciationMode } from '../settings/pronunciationMode'
import type { PronunciationMode } from '../settings/pronunciationMode'
import { readMogherLinks } from '../settings/mogherLinks'
import { EntryList } from '../components/EntryList'
import { EntryTree } from '../components/EntryTree'
import { EntryDetail } from '../components/EntryDetail'
import type { EnrichedEntry } from '../types/dict'
import './DictionaryView.css'

const SORT_MODE_LABELS: Record<SortMode, string> = {
  relevance: 'Relevance',
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
  // Persisted as of the Settings tab (issue #173) — previously deliberately
  // not persisted here, because narrowing the visible entries silently across
  // a reload was worse than re-ticking a box. That tradeoff is reversed now
  // that this is a named, discoverable setting shared with the Settings tab
  // rather than an easily-forgotten local toggle.
  const [audioOnly, setAudioOnly] = useState(readAudioOnly)
  const [fullAudioOnly, setFullAudioOnly] = useState(readFullAudioOnly)
  const [sortMode, setSortMode] = useState<SortMode>('relevance')
  const [pronunciation, setPronunciation] = useState<PronunciationMode>(readPronunciationMode)
  const [mogherLinks] = useState(readMogherLinks)

  const index = useMemo(() => createSearchIndex(entries), [entries])
  const isSearching = query.trim() !== ''
  const matches = useMemo(
    () => (isSearching ? search(index, query) : entries),
    [index, query, entries, isSearching],
  )
  const audioFiltered = useMemo(() => (audioOnly ? matches.filter(hasAudio) : matches), [matches, audioOnly])
  const results = useMemo(
    () => (fullAudioOnly ? audioFiltered.filter(hasFullAudio) : audioFiltered),
    [audioFiltered, fullAudioOnly],
  )

  // Distinguishes "your search found nothing with a recording" from "this
  // dictionary has no recordings at all", which is the case for every entry
  // today — without it the filter just looks broken.
  const anyAudio = useMemo(() => entries.some(hasAudio), [entries])
  const anyFullAudio = useMemo(() => entries.some(hasFullAudio), [entries])

  // "Relevance" only means something while a query is active — Fuse hands back
  // its hits best-first and we keep that order. With no query there is no
  // ranking to preserve, so browsing the whole dictionary falls back to
  // headword order rather than showing it in data-file order.
  const effectiveSort: SortMode = sortMode === 'relevance' && !isSearching ? 'headword' : sortMode

  const isFlat = !isGrouped(effectiveSort)
  const sortedEntries = useMemo(
    () => (isGrouped(effectiveSort) ? [] : sortFlat(results, effectiveSort)),
    [results, effectiveSort],
  )
  const groups = useMemo(
    () => (isGrouped(effectiveSort) ? groupEntries(results, effectiveSort, pronunciation) : []),
    [results, effectiveSort, pronunciation],
  )

  const selected = results.find((e) => e.id === selectedId) ?? entries.find((e) => e.id === selectedId) ?? null

  const toggleShowLicence = (value: boolean) => {
    setShowLicence(value)
    writeShowLicence(value)
  }

  const toggleAudioOnly = (value: boolean) => {
    setAudioOnly(value)
    writeAudioOnly(value)
  }

  const toggleFullAudioOnly = (value: boolean) => {
    setFullAudioOnly(value)
    writeFullAudioOnly(value)
  }

  const setPronunciationAndPersist = (next: PronunciationMode) => {
    setPronunciation(next)
    writePronunciationMode(next)
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
        <div className="dictionary-view__toggles">
          <label className="dictionary-view__toggle">
            <input
              type="checkbox"
              checked={showLicence}
              onChange={(e) => toggleShowLicence(e.target.checked)}
            />
            Show licensing info
          </label>
          <label className="dictionary-view__toggle">
            <input type="checkbox" checked={audioOnly} onChange={(e) => toggleAudioOnly(e.target.checked)} />
            Only entries with audio
          </label>
          <label className="dictionary-view__toggle">
            <input
              type="checkbox"
              checked={fullAudioOnly}
              onChange={(e) => toggleFullAudioOnly(e.target.checked)}
            />
            Only fully recorded audio
          </label>
        </div>
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
              value={pronunciation}
              onChange={(e) => setPronunciationAndPersist(e.target.value as PronunciationMode)}
            >
              <option value="citation">Citation tone</option>
              <option value="sandhi">Sandhi tone</option>
            </select>
          )}
        </div>
        {(audioOnly || fullAudioOnly) && results.length === 0 ? (
          <p className="entry-list__empty">
            {fullAudioOnly
              ? anyFullAudio
                ? 'No matches with fully recorded audio.'
                : 'No fully recorded entries in the dictionary yet.'
              : anyAudio
                ? 'No matches with a recording.'
                : 'No recordings in the dictionary yet.'}
          </p>
        ) : isFlat ? (
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
          <EntryDetail
            key={selected.id}
            entry={selected}
            showLicence={showLicence}
            pronunciation={pronunciation}
            mogherLinks={mogherLinks}
          />
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
