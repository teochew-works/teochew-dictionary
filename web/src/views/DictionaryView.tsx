import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { createSearchIndex, search } from '../search/searchIndex'
import { readShowLicence, writeShowLicence } from '../settings/showLicence'
import { readAudioOnly, writeAudioOnly } from '../settings/audioOnly'
import { readFullAudioOnly, writeFullAudioOnly } from '../settings/fullAudioOnly'
import { readMogherLinks } from '../settings/mogherLinks'
import { EntryList } from '../components/EntryList'
import { EntryTree } from '../components/EntryTree'
import { EntryDetail } from '../components/EntryDetail'
import {
  capGroups,
  groupEntries,
  isGrouped,
  sortFlat,
  hasAudio,
  hasFullAudio,
  readPronunciationMode,
  writePronunciationMode,
  type SortMode,
  type PronunciationMode,
  type EnrichedEntry,
} from '@teochew/core'
import './DictionaryView.css'

/**
 * How many rows go into the DOM at once. The dictionary is 16,000+ entries and
 * an uncapped list put every one of them there — 84,000 nodes at rest — which
 * made each keystroke rebuild the whole thing, blocking the main thread for up
 * to 600ms. Nobody scrolls 16,000 rows; the ones past this are reached by
 * searching or by asking for more.
 */
const PAGE_SIZE = 200

/**
 * The phone breakpoint, in step with the `max-width: 640px` blocks in
 * DictionaryView.css — this is the one place the tier has to be known in JS
 * as well, to decide whether the filters disclosure starts collapsed.
 */
const PHONE_QUERY = '(max-width: 640px)'

const SORT_MODE_LABELS: Record<SortMode, string> = {
  relevance: 'Relevance',
  headword: 'Headword',
  english: 'English',
  tone: 'Tone',
  category: 'Category',
  level: 'Level',
}

export function DictionaryView({
  entries,
  selectedId: controlledSelectedId,
  onSelectEntry,
}: {
  entries: EnrichedEntry[]
  // Both optional so the view still works standalone (as in this file's own
  // tests): uncontrolled internal state when the parent doesn't route
  // selection through the URL, controlled when it does (App.tsx, mobile.md
  // §3.3 — hash-routed so a phone's back gesture returns to the list instead
  // of leaving the app, and an entry gets a shareable deep link).
  selectedId?: string | null
  onSelectEntry?: (id: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  const selectedId = controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId
  const setSelectedId = onSelectEntry ?? setInternalSelectedId
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
  // Below the phone breakpoint the filters collapse behind the "Filters"
  // summary, which otherwise pushes the first result 200px down the screen
  // (mobile.md §3.3). Above it that summary is `display: none`, so the
  // disclosure has to be open for the filters to be reachable at all.
  //
  // Hence a live media query rather than a width read once at mount: a phone
  // rotated to landscape crosses 640px without remounting, and a mount-time
  // read would leave the disclosure closed with the only control that could
  // reopen it now hidden — filters gone until a reload.
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches)
  const [filtersOpenOnPhone, setFiltersOpenOnPhone] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY)
    const onChange = (event: MediaQueryListEvent) => setIsPhone(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const index = useMemo(() => createSearchIndex(entries), [entries])

  /*
   * The searched-for text lags the typed text on purpose. Searching 16,000
   * entries costs 30-100ms depending on how many words the query has, and
   * running it in the keystroke's own render meant the character you typed
   * could not appear until it finished. Deferring lets the input paint
   * immediately and the results catch up, and React can abandon a result
   * render that is already stale.
   */
  const deferredQuery = useDeferredValue(query)
  const isSearching = deferredQuery.trim() !== ''
  const isStale = query !== deferredQuery
  const matches = useMemo(
    () => (isSearching ? search(index, deferredQuery) : entries),
    [index, deferredQuery, entries, isSearching],
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

  // Sorting and grouping run over everything — they are cheap, and capping
  // before them would change *which* entries you see rather than only how many.
  const [shown, setShown] = useState(PAGE_SIZE)
  useEffect(() => {
    setShown(PAGE_SIZE)
  }, [deferredQuery, effectiveSort, audioOnly, fullAudioOnly, pronunciation])

  const visibleEntries = useMemo(() => sortedEntries.slice(0, shown), [sortedEntries, shown])
  const visibleGroups = useMemo(() => capGroups(groups, shown), [groups, shown])
  const hidden = results.length - shown

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
    <div className={selected ? 'dictionary-view dictionary-view--detail-open' : 'dictionary-view'}>
      <div className="dictionary-view__list-pane">
        <input
          type="search"
          className="dictionary-view__search"
          placeholder="Search headword, Peng'im, POJ, or English…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the dictionary"
        />
        <details
          className="dictionary-view__filters"
          open={!isPhone || filtersOpenOnPhone}
          // Only a tap on the phone's summary is a preference worth keeping.
          // Widening past the breakpoint also fires this (React sets `open`
          // to force the filters back into view), and by then `isPhone` is
          // false — so that one is ignored and rotating back to portrait
          // restores the collapsed state rather than silently expanding it.
          onToggle={(event) => {
            if (isPhone) setFiltersOpenOnPhone(event.currentTarget.open)
          }}
        >
          <summary className="dictionary-view__filters-summary">Filters</summary>
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
        </details>
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
        ) : (
          <div className={isStale ? 'dictionary-view__results dictionary-view__results--stale' : 'dictionary-view__results'}>
            {isFlat ? (
              <EntryList entries={visibleEntries} selectedId={selectedId} onSelect={setSelectedId} />
            ) : (
              <EntryTree groups={visibleGroups} selectedId={selectedId} onSelect={setSelectedId} isSearching={isSearching} />
            )}
            {hidden > 0 && (
              <div className="dictionary-view__more">
                <span>
                  Showing {shown.toLocaleString()} of {results.length.toLocaleString()}
                </span>
                <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, hidden).toLocaleString()} more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="dictionary-view__detail-pane">
        {selected ? (
          <>
            {/* Phone only (CSS) — below 640px the two panes are two screens,
                not two columns, so getting back to the list needs an
                explicit affordance rather than just seeing it beside the
                detail (mobile.md §3.3). The browser/OS back gesture also
                works, since selecting an entry pushed a history entry via
                the hash. */}
            <button type="button" className="dictionary-view__back" onClick={() => setSelectedId(null)}>
              ‹ Back to list
            </button>
            {/* Keyed so selecting another entry remounts the pane: EntryDetail
                owns the audio player, and a clip should stop when the user
                navigates away from the entry it belongs to. */}
            <EntryDetail
              key={selected.id}
              entry={selected}
              showLicence={showLicence}
              pronunciation={pronunciation}
              mogherLinks={mogherLinks}
            />
          </>
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
