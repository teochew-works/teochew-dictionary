import { useMemo } from 'react'
import { useSrsQueue } from '../srs/useSrsQueue'
import { Flashcard } from '../components/Flashcard'
import type { EnrichedEntry } from '../types/dict'
import './FlashcardsView.css'

export function FlashcardsView({ entries }: { entries: EnrichedEntry[] }) {
  const { current, reviewedCount, totalCount, loading, persistError, grade } = useSrsQueue(entries)

  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const currentEntry = current ? entryById.get(current.entryId) : null

  if (loading) {
    return <p className="flashcards-view__status">Loading your review queue…</p>
  }

  return (
    <div className="flashcards-view">
      {persistError && (
        <p className="flashcards-view__warning">
          ⚠ Your progress can't be saved in this browser ({persistError}). You can still review this session.
        </p>
      )}

      <p className="flashcards-view__progress">
        {reviewedCount} reviewed{totalCount > 0 ? ` · ${totalCount} in this session` : ''}
      </p>

      {currentEntry ? (
        <Flashcard entry={currentEntry} onGrade={grade} />
      ) : (
        <p className="flashcards-view__status">
          Nothing due right now — come back later, or check back tomorrow for new cards.
        </p>
      )}
    </div>
  )
}
