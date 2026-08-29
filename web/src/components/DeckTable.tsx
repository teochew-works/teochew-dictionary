import { DeckChip } from './DeckChip'
import { useDragReorder } from '../decks/dnd/useDragReorder'
import { useKeyboardReorder } from '../decks/dnd/useKeyboardReorder'
import type { Deck } from '../decks/types'

/**
 * "The table" (issue #187 stages 2-3): the decks currently in play, in
 * order. A deck can be reordered or taken off the table by dragging its
 * handle (useDragReorder — drop outside the table to remove) or, fully
 * equivalently, by keyboard (useKeyboardReorder's lift/arrow/drop/escape
 * pattern) or the plain "×" button. Adding a deck is a select — dragging a
 * deck onto the table from the library rail is issue #187 stage 4, once the
 * rail has real decks to drag.
 */
export function DeckTable({
  inPlayDecks,
  availableDecks,
  onAdd,
  onRemove,
  onReorder,
  announce,
}: {
  inPlayDecks: Deck[]
  availableDecks: Deck[]
  onAdd: (deckId: string) => void
  onRemove: (deckId: string) => void
  onReorder: (orderedIds: string[]) => void
  announce: (message: string) => void
}) {
  const ids = inPlayDecks.map((d) => d.id)
  const nameById = new Map(inPlayDecks.map((d) => [d.id, d.name]))
  const labelFor = (id: string) => nameById.get(id) ?? id

  const keyboard = useKeyboardReorder(ids, onReorder, announce, labelFor)
  const drag = useDragReorder({ ids, onReorder, onDropOutside: onRemove, announce, labelFor, axis: 'horizontal' })

  const chipsClass = drag.isOverContainer ? 'deck-table__chips' : 'deck-table__chips deck-table__chips--drag-leaving'

  return (
    <div className="deck-table">
      <div className={chipsClass} ref={drag.containerRef}>
        {inPlayDecks.length === 0 && <span className="deck-table__empty">No decks on the table</span>}
        {inPlayDecks.map((deck) => (
          <div key={deck.id} className="deck-table__item" ref={drag.itemRef(deck.id)}>
            <DeckChip
              deck={deck}
              onRemove={() => onRemove(deck.id)}
              drag={{
                grabbed: keyboard.isGrabbed(deck.id),
                dragging: drag.isDragging(deck.id),
                onPointerDown: drag.onPointerDown(deck.id),
                onKeyDown: (e) => keyboard.handleKeyDown(deck.id, e),
              }}
            />
          </div>
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
