import { useMemo, useState } from 'react'
import { useSounds } from '../hooks/useSounds'
import { useSyllableChart } from '../hooks/useSyllableChart'
import { useLocalRecordingsStatus, type PublishedClip } from '../hooks/useLocalRecordingsStatus'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { RecordClipButton, type RecordStatus } from '../components/RecordClipButton'
import { PlayClipButton, clipLabel } from '../components/PlayClipButton'
import { SyllableChartGrid, chartCellKey } from './SyllableChartGrid'
import { ChartDetailPanel, type SelectedCell } from './ChartDetailPanel'
import type { Sound } from '../types/sounds'
import './SoundsView.css'

interface LetterGroup {
  letter: string
  sounds: Sound[]
}

type SoundSortMode = 'alphabetical' | 'frequency' | 'chart'

/**
 * Buckets consecutive sounds sharing a Peng'im initial letter. Relies on
 * `sounds` already being sorted alphabetically by Peng'im (guaranteed by
 * `src/build/sounds.ts`) rather than hard-coding the set of initials, so a
 * future change to the orthography's initials can't leave this stale. Only
 * meaningful in alphabetical sort mode — frequency order isn't alphabetically
 * contiguous, so it renders as one flat ranked list instead (see `SoundsView`).
 */
function groupByLetter(sounds: Sound[]): LetterGroup[] {
  const groups: LetterGroup[] = []
  for (const sound of sounds) {
    const letter = sound.pengim.charAt(0)
    const last = groups.at(-1)
    if (last && last.letter === letter) last.sounds.push(sound)
    else groups.push({ letter, sounds: [sound] })
  }
  return groups
}

/** Most occurrences first; ties broken alphabetically for a stable order. */
function byFrequencyDesc(a: Sound, b: Sound): number {
  if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences
  return a.pengim < b.pengim ? -1 : a.pengim > b.pengim ? 1 : 0
}

function matchesQuery(sound: Sound, query: string): boolean {
  if (!query) return true
  const haystack = [sound.pengim, sound.ipa, ...sound.examples.flatMap((e) => [e.headword, e.pengim, e.gloss])]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function SoundRow({
  sound,
  showCount,
  recordStatus,
  clips,
  playingId,
  onPlay,
  onSaved,
}: {
  sound: Sound
  showCount: boolean
  recordStatus: RecordStatus
  clips: PublishedClip[]
  playingId: string | null
  onPlay: (id: string, url: string) => void
  onSaved: (pengim: string) => void
}) {
  return (
    <li className="sound-row">
      <span className="sound-row__ipa">{sound.ipa}</span>
      <span className="sound-row__pengim">{sound.pengim}</span>
      {showCount && <span className="sound-row__count">{sound.occurrences}×</span>}
      <span className="sound-row__examples">
        {sound.examples.length === 0 && <span className="sound-row__no-examples">no isolated example yet</span>}
        {/* Index, not a text-derived key: two senses of the same word (same
            headword + pengim, different gloss) can both appear as examples
            for one sound, and this list is never reordered or filtered
            independently. */}
        {sound.examples.map((example, i) => (
          <span key={i} className="sound-row__example">
            <span className="sound-row__example-hanzi">{example.headword}</span>
            <span className="sound-row__example-pengim">{example.pengim}</span>
            <span className="sound-row__example-gloss">{example.gloss}</span>
          </span>
        ))}
      </span>
      {(clips.length > 0 || import.meta.env.DEV) && (
        <span className="sound-row__controls">
          {clips.length > 0 && (
            <span className="sound-row__play-list">
              {clips.map((clip, i) => (
                <PlayClipButton
                  key={i}
                  id={`${sound.pengim}:${i}`}
                  clip={clip}
                  label={clipLabel(clip, i, clips.length)}
                  ariaLabel={
                    clip.speaker
                      ? `Play recording by ${clip.speaker}`
                      : clips.length > 1
                        ? `Play recording ${i + 1}`
                        : 'Play recording'
                  }
                  playingId={playingId}
                  onPlay={onPlay}
                />
              ))}
            </span>
          )}
          {import.meta.env.DEV && (
            <RecordClipButton pengim={sound.pengim} status={recordStatus} onSaved={onSaved} />
          )}
        </span>
      )}
    </li>
  )
}

export function SoundsView() {
  const { data, loading, error } = useSounds()
  const [query, setQuery] = useState('')
  // Deliberately not persisted: mirrors DictionaryView's sortMode, which
  // reorders what's on screen rather than hiding it, so resetting on revisit
  // is safer than silently surprising the user with a stale sort.
  const [sortMode, setSortMode] = useState<SoundSortMode>('alphabetical')

  // Dev-only (see RecordClipButton); the hook itself no-ops in production.
  const localRecordings = useLocalRecordingsStatus()
  const [justSaved, setJustSaved] = useState<Set<string>>(() => new Set())
  const recordStatus = (clips: PublishedClip[], pengim: string): RecordStatus => {
    if (clips.length > 0) return 'published'
    if (justSaved.has(pengim) || localRecordings?.pending.has(pengim)) return 'pending'
    return 'none'
  }
  const markSaved = (pengim: string) => setJustSaved((prev) => new Set(prev).add(pengim))

  // One shared <audio> element for the whole tab, same primitive the
  // Dictionary tab plays clips with — starting one row's clip stops another.
  const { playingId, play } = useAudioPlayer()

  const chart = useSyllableChart(sortMode === 'chart')
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)
  const [audioCoverageOn, setAudioCoverageOn] = useState(false)

  const allLetters = useMemo(() => groupByLetter(data?.sounds ?? []).map((g) => g.letter), [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.sounds.filter((s) => matchesQuery(s, q))
  }, [data, query])

  const groups = useMemo(() => (sortMode === 'alphabetical' ? groupByLetter(filtered) : []), [filtered, sortMode])
  const ranked = useMemo(
    () => (sortMode === 'frequency' ? [...filtered].sort(byFrequencyDesc) : []),
    [filtered, sortMode],
  )

  // Chart mode never filters `data.sounds` (that would reflow the grid) — it
  // groups the full, unfiltered list by cell instead, and dims non-matches
  // via a separate signal (`chartMatchingCells`) computed below.
  const soundsByCell = useMemo(() => {
    const map = new Map<string, Sound[]>()
    for (const sound of data?.sounds ?? []) {
      const key = chartCellKey(sound.initial ?? '', sound.rime)
      const list = map.get(key)
      if (list) list.push(sound)
      else map.set(key, [sound])
    }
    for (const list of map.values()) list.sort((a, b) => a.tone - b.tone)
    return map
  }, [data])

  const chartMatchingCells = useMemo(() => {
    if (sortMode !== 'chart' || !data) return null
    const q = query.trim().toLowerCase()
    if (!q) return null
    const matches = new Set<string>()
    for (const sound of data.sounds) {
      if (matchesQuery(sound, q)) matches.add(chartCellKey(sound.initial ?? '', sound.rime))
    }
    return matches
  }, [data, query, sortMode])

  if (loading) return <p className="sounds-view__status">Loading sound inventory…</p>
  if (error) {
    return <p className="sounds-view__status sounds-view__status--error">Couldn't load the sound inventory ({error}).</p>
  }
  if (!data) return null

  const activeLetters = new Set(groups.map((g) => g.letter))
  const shownCount = filtered.length

  return (
    <div className="sounds-view">
      <div className="sounds-view__controls">
        <input
          type="search"
          className="sounds-view__search"
          placeholder="Search sound, Peng'im, hanzi, or gloss…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the sound inventory"
        />
        <div className="sounds-view__sort" role="group" aria-label="Sort sounds by">
          <button
            type="button"
            className={sortMode === 'alphabetical' ? 'sounds-view__sort-button sounds-view__sort-button--active' : 'sounds-view__sort-button'}
            onClick={() => setSortMode('alphabetical')}
          >
            A–Z
          </button>
          <button
            type="button"
            className={sortMode === 'frequency' ? 'sounds-view__sort-button sounds-view__sort-button--active' : 'sounds-view__sort-button'}
            onClick={() => setSortMode('frequency')}
          >
            Frequency
          </button>
          <button
            type="button"
            className={sortMode === 'chart' ? 'sounds-view__sort-button sounds-view__sort-button--active' : 'sounds-view__sort-button'}
            onClick={() => setSortMode('chart')}
          >
            Chart
          </button>
        </div>
        <span className="sounds-view__count">
          {sortMode === 'chart' && chart.data
            ? `${chartMatchingCells?.size ?? chart.data.cells.length} / ${chart.data.cells.length} cells`
            : `${shownCount} / ${data.sounds.length} sounds`}
        </span>
      </div>

      {sortMode === 'alphabetical' && (
        <nav className="sounds-view__alphabet" aria-label="Jump to initial">
          {allLetters.map((letter) => {
            const active = activeLetters.has(letter)
            return (
              <a
                key={letter}
                href={`#sound-group-${letter}`}
                className={active ? 'sounds-view__letter' : 'sounds-view__letter sounds-view__letter--empty'}
                aria-disabled={!active}
                tabIndex={active ? 0 : -1}
              >
                {letter}
              </a>
            )
          })}
        </nav>
      )}

      {sortMode === 'chart' && (
        <div className="sounds-view__chart">
          <div className="sounds-view__chart-subbar">
            <div className="sounds-view__chart-legend" aria-hidden="true">
              <span className="sounds-view__chart-legend-swatch sounds-view__chart-legend-swatch--attested" />
              attested
              <span className="sounds-view__chart-legend-swatch sounds-view__chart-legend-swatch--unattested" />
              legal, unattested
              {/* Styled but not yet wired — no data source exists today (issue #171, tracked as a follow-up). */}
              <span className="sounds-view__chart-legend-swatch sounds-view__chart-legend-swatch--external" />
              seen in other charts only
              <span className="sounds-view__chart-legend-swatch sounds-view__chart-legend-swatch--illegal" />
              not a legal syllable
            </div>
            <button
              type="button"
              className={
                audioCoverageOn
                  ? 'sounds-view__sort-button sounds-view__sort-button--active'
                  : 'sounds-view__sort-button'
              }
              aria-pressed={audioCoverageOn}
              onClick={() => setAudioCoverageOn((v) => !v)}
            >
              Audio coverage
            </button>
            {chart.data && (
              <span className="sounds-view__chart-coverage-summary">
                {chart.data.coverage.syllablesRecorded} / {chart.data.coverage.syllablesAttested} syllables recorded (
                {chart.data.coverage.cellsWithRecording} / {chart.data.coverage.cellsAttested} cells,{' '}
                {chart.data.coverage.cellsAttested > 0
                  ? Math.round((chart.data.coverage.cellsWithRecording / chart.data.coverage.cellsAttested) * 100)
                  : 0}
                %)
              </span>
            )}
          </div>
          <div className="sounds-view__chart-body">
            {chart.loading && <p className="sounds-view__status">Loading syllable chart…</p>}
            {chart.error && (
              <p className="sounds-view__status sounds-view__status--error">
                Couldn't load the syllable chart ({chart.error}).
              </p>
            )}
            {chart.data && (
              <>
                <SyllableChartGrid
                  chart={chart.data}
                  selectedCell={selectedCell}
                  onSelectCell={setSelectedCell}
                  dimmedExcept={chartMatchingCells}
                  audioCoverageOn={audioCoverageOn}
                />
                <ChartDetailPanel
                  cell={selectedCell}
                  chartCell={
                    selectedCell
                      ? (chart.data.cells.find(
                          (c) => c.initial === selectedCell.initial && c.rime === selectedCell.rime,
                        ) ?? null)
                      : null
                  }
                  sounds={selectedCell ? (soundsByCell.get(chartCellKey(selectedCell.initial, selectedCell.rime)) ?? []) : []}
                  localRecordings={localRecordings}
                  recordStatus={recordStatus}
                  onSaved={markSaved}
                  playingId={playingId}
                  onPlay={play}
                />
              </>
            )}
          </div>
        </div>
      )}

      {sortMode !== 'chart' && (
        <div className="sounds-view__list">
          {shownCount === 0 && <p className="sounds-view__empty">No sounds match "{query.trim()}".</p>}

          {sortMode === 'alphabetical' &&
            groups.map(({ letter, sounds }) => (
              <section key={letter} id={`sound-group-${letter}`} className="sounds-view__group">
                <h2 className="sounds-view__group-heading">
                  {letter}
                  <span className="sounds-view__group-count">{sounds.length}</span>
                </h2>
                <ul className="sounds-view__rows">
                  {sounds.map((sound) => {
                    const clips = localRecordings?.published.get(sound.pengim) ?? sound.clips
                    return (
                      <SoundRow
                        key={sound.pengim}
                        sound={sound}
                        showCount={false}
                        recordStatus={recordStatus(clips, sound.pengim)}
                        clips={clips}
                        playingId={playingId}
                        onPlay={play}
                        onSaved={markSaved}
                      />
                    )
                  })}
                </ul>
              </section>
            ))}

          {sortMode === 'frequency' && ranked.length > 0 && (
            <ul className="sounds-view__rows">
              {ranked.map((sound) => {
                const clips = localRecordings?.published.get(sound.pengim) ?? sound.clips
                return (
                  <SoundRow
                    key={sound.pengim}
                    sound={sound}
                    showCount
                    recordStatus={recordStatus(clips, sound.pengim)}
                    clips={clips}
                    playingId={playingId}
                    onPlay={play}
                    onSaved={markSaved}
                  />
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
