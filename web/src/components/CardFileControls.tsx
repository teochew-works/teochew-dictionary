import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Deck } from '../decks/types'

/**
 * Files the current flashcard into a deck (issue #187 stage 4): a drag
 * handle (wired to decks/dnd/useCardDrag.ts, dropped onto a library rail
 * row) alongside a plain select for the pointer-only/keyboard-only path —
 * "every drag also has a pointer-only path".  Only rendered when at least
 * one user deck exists; the dictionary deck is never a valid target.
 */
export function CardFileControls({
  headword,
  userDecks,
  dragging,
  onPointerDown,
  onFile,
}: {
  headword: string
  userDecks: Deck[]
  dragging: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onFile: (deckId: string) => void
}) {
  return (
    <div className={dragging ? 'card-file-controls card-file-controls--dragging' : 'card-file-controls'}>
      <button
        type="button"
        className="card-file-controls__handle"
        aria-label={`Drag to file ${headword} into a deck`}
        onPointerDown={onPointerDown}
      >
        ⠿ File into deck
      </button>
      <select
        className="card-file-controls__select"
        aria-label={`File ${headword} into a deck`}
        value=""
        onChange={(e) => {
          if (e.target.value) onFile(e.target.value)
        }}
      >
        <option value="" disabled>
          File into deck…
        </option>
        {userDecks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>
    </div>
  )
}
