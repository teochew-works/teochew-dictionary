import { useMemo, useState } from 'react'
import { useSrsQueue } from '../srs/useSrsQueue'
import { Flashcard } from '../components/Flashcard'
import type { EnrichedEntry } from '../types/dict'
import { PROMPT_MODE_LABELS, isEligibleForMode, readPromptMode, writePromptMode } from '../flashcards/promptMode'
import type { PromptMode } from '../flashcards/promptMode'
import './FlashcardsView.css'

export function FlashcardsView({ entries }: { entries: EnrichedEntry[] }) {
  const [mode, setMode] = useState<PromptMode>(readPromptMode)

  function handleModeChange(next: PromptMode) {
    setMode(next)
    writePromptMode(next)
  }

  const eligibleEntries = useMemo(() => entries.filter((e) => isEligibleForMode(e, mode)), [entries, mode])
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

      {persistError && (
        <p className="flashcards-view__warning">
          ⚠ Your progress can't be saved in this browser ({persistError}). You can still review this session.
        </p>
      )}

      <p className="flashcards-view__progress">
        {reviewedCount} reviewed{totalCount > 0 ? ` · ${totalCount} in this session` : ''}
      </p>

      {entries.length > 0 && eligibleEntries.length === 0 ? (
        <p className="flashcards-view__status">
          No entries are available for {PROMPT_MODE_LABELS[mode]} mode yet — try a different mode.
        </p>
      ) : currentEntry ? (
        <Flashcard key={currentEntry.id} entry={currentEntry} mode={mode} onGrade={grade} />
      ) : (
        <p className="flashcards-view__status">
          Nothing due right now — come back later, or check back tomorrow for new cards.
        </p>
      )}
    </div>
  )
}
