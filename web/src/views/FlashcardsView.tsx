import { useMemo, useState } from 'react'
import { useSrsQueue } from '../srs/useSrsQueue'
import { Flashcard } from '../components/Flashcard'
import type { EnrichedEntry } from '../types/dict'
import { PROMPT_MODE_LABELS, isEligibleForMode, readPromptMode, writePromptMode } from '../flashcards/promptMode'
import type { PromptMode } from '../flashcards/promptMode'
import {
  LEVEL_FILTER_ORDER,
  isEligibleForLevel,
  levelFilterLabel,
  readLevelFilter,
  writeLevelFilter,
} from '../flashcards/levelFilter'
import type { LevelFilterValue } from '../flashcards/levelFilter'
import { hasFullAudio } from '../search/filters'
import { readFullAudioOnly, writeFullAudioOnly } from '../settings/fullAudioOnly'
import { readPronunciationMode, writePronunciationMode } from '../settings/pronunciationMode'
import type { PronunciationMode } from '../settings/pronunciationMode'
import './FlashcardsView.css'

export function FlashcardsView({ entries }: { entries: EnrichedEntry[] }) {
  const [mode, setMode] = useState<PromptMode>(readPromptMode)
  const [pronunciation, setPronunciation] = useState<PronunciationMode>(readPronunciationMode)
  const [levelFilter, setLevelFilter] = useState<Set<LevelFilterValue>>(readLevelFilter)
  const [fullAudioOnly, setFullAudioOnly] = useState<boolean>(readFullAudioOnly)

  function handleModeChange(next: PromptMode) {
    setMode(next)
    writePromptMode(next)
  }

  function handlePronunciationToggle(checked: boolean) {
    const next: PronunciationMode = checked ? 'sandhi' : 'citation'
    setPronunciation(next)
    writePronunciationMode(next)
  }

  function handleLevelToggle(value: LevelFilterValue, checked: boolean) {
    const next = new Set(levelFilter)
    if (checked) next.add(value)
    else next.delete(value)
    setLevelFilter(next)
    writeLevelFilter(next)
  }

  function handleFullAudioOnlyChange(next: boolean) {
    setFullAudioOnly(next)
    writeFullAudioOnly(next)
  }

  const modeEligibleEntries = useMemo(() => entries.filter((e) => isEligibleForMode(e, mode)), [entries, mode])
  const levelEligibleEntries = useMemo(
    () => modeEligibleEntries.filter((e) => isEligibleForLevel(e, levelFilter)),
    [modeEligibleEntries, levelFilter],
  )
  const eligibleEntries = useMemo(
    () => (fullAudioOnly ? levelEligibleEntries.filter(hasFullAudio) : levelEligibleEntries),
    [levelEligibleEntries, fullAudioOnly],
  )
  const { current, reviewedCount, totalCount, loading, persistError, grade } = useSrsQueue(eligibleEntries)

  const entryById = useMemo(() => new Map(eligibleEntries.map((e) => [e.id, e])), [eligibleEntries])
  const currentEntry = current ? entryById.get(current.entryId) : null

  if (loading) {
    return <p className="flashcards-view__status">Loading your review queue…</p>
  }

  return (
    <div className="flashcards-view">
      <select
        className="flashcards-view__mode"
        aria-label="Flashcard prompt"
        value={mode}
        onChange={(e) => handleModeChange(e.target.value as PromptMode)}
      >
        {Object.entries(PROMPT_MODE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <label className="flashcards-view__toggle">
        <input
          type="checkbox"
          checked={pronunciation === 'sandhi'}
          onChange={(e) => handlePronunciationToggle(e.target.checked)}
        />
        Use sandhi pronunciation
      </label>

      <label className="flashcards-view__toggle">
        <input
          type="checkbox"
          checked={fullAudioOnly}
          onChange={(e) => handleFullAudioOnlyChange(e.target.checked)}
        />
        Only fully recorded audio
      </label>

      <fieldset className="flashcards-view__levels">
        <legend>Levels</legend>
        {LEVEL_FILTER_ORDER.map((value) => (
          <label key={value} className="flashcards-view__level-toggle">
            <input
              type="checkbox"
              checked={levelFilter.has(value)}
              onChange={(e) => handleLevelToggle(value, e.target.checked)}
            />
            {levelFilterLabel(value)}
          </label>
        ))}
      </fieldset>

      {persistError && (
        <p className="flashcards-view__warning">
          ⚠ Your progress can't be saved in this browser ({persistError}). You can still review this session.
        </p>
      )}

      <p className="flashcards-view__progress">
        {reviewedCount} reviewed{totalCount > 0 ? ` · ${totalCount} in this session` : ''}
      </p>

      {entries.length > 0 && modeEligibleEntries.length === 0 ? (
        <p className="flashcards-view__status">
          No entries are available for {PROMPT_MODE_LABELS[mode]} mode yet — try a different mode.
        </p>
      ) : modeEligibleEntries.length > 0 && levelEligibleEntries.length === 0 ? (
        <p className="flashcards-view__status">
          No entries match the selected levels — try including more levels.
        </p>
      ) : levelEligibleEntries.length > 0 && eligibleEntries.length === 0 ? (
        <p className="flashcards-view__status">
          No entries have fully recorded audio yet — try unchecking "Only fully recorded audio."
        </p>
      ) : currentEntry ? (
        <Flashcard key={currentEntry.id} entry={currentEntry} mode={mode} pronunciation={pronunciation} onGrade={grade} />
      ) : (
        <p className="flashcards-view__status">
          Nothing due right now — come back later, or check back tomorrow for new cards.
        </p>
      )}
    </div>
  )
}
