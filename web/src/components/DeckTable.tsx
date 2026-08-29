import { DeckChip } from './DeckChip'
import type { Deck } from '../decks/types'

/**
 * "The table" (issue #187 stage 2): the decks currently in play. Adding a
 * deck is a plain select for now — stage 3 layers drag-and-drop from the
 * library rail on top of the same onAdd/onRemove callbacks, so this control
 * stays as the pointer-only/keyboard path drag always needs alongside it.
 */
export function DeckTable({
  inPlayDecks,
  availableDecks,
  onAdd,
  onRemove,
}: {
  inPlayDecks: Deck[]
  availableDecks: Deck[]
  onAdd: (deckId: string) => void
  onRemove: (deckId: string) => void
}) {
  return (
    <div className="deck-table">
      <div className="deck-table__chips">
        {inPlayDecks.length === 0 && <span className="deck-table__empty">No decks on the table</span>}
        {inPlayDecks.map((deck) => (
          <DeckChip key={deck.id} deck={deck} onRemove={() => onRemove(deck.id)} />
        ))}
      </div>
      <select
        className="deck-table__add"
        aria-label="Add a deck to the table"
        value=""
        disabled={availableDecks.length === 0}
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value)
        }}
      >
        <option value="" disabled>
          {availableDecks.length === 0 ? 'All decks are in play' : 'Add a deck…'}
        </option>
        {availableDecks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>
    </div>
  )
}
