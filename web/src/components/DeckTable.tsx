import { Fragment, useEffect } from 'react'
import { DeckChip } from './DeckChip'
import { DragGhost } from './DragGhost'
import { useDragReorder } from '../decks/dnd/useDragReorder'
import type { DropZoneHandle } from '../decks/dnd/useDragReorder'
import { useKeyboardReorder } from '../decks/dnd/useKeyboardReorder'
import { useDragGhost } from '../decks/dnd/useDragGhost'
import { useFlip } from '../decks/dnd/useFlip'
import { prefersReducedMotion } from '../decks/dnd/prefersReducedMotion'
import type { Deck } from '../decks/types'

/**
 * "The table" (issue #187 stages 2-3): the decks currently in play, in
 * order. A deck can be reordered or taken off the table by dragging its
 * handle (useDragReorder — drop outside the table to remove) or, fully
 * equivalently, by keyboard (useKeyboardReorder's lift/arrow/drop/escape
 * pattern) or the plain "×" button. Adding a deck is a select — or, since
 * issue #189, dragging (or keyboard-moving) a deck onto the table from the
 * library rail: `onDropZoneChange` hands this table's own `DropZoneHandle`
 * up so `DeckRail`'s drag/keyboard hooks can target it directly.
 */
export function DeckTable({
  inPlayDecks,
  availableDecks,
  onAdd,
  onRemove,
  onReorder,
  announce,
  onDropZoneChange,
  incomingPreviewIndex,
}: {
  inPlayDecks: Deck[]
  availableDecks: Deck[]
  onAdd: (deckId: string) => void
  onRemove: (deckId: string) => void
  onReorder: (orderedIds: string[]) => void
  announce: (message: string) => void
  onDropZoneChange?: (dropZone: DropZoneHandle) => void
  /** Where a deck currently being dragged from the rail would land if dropped now — issue #189's cross-list insertion caret. */
  incomingPreviewIndex?: number | null
}) {
  const ids = inPlayDecks.map((d) => d.id)
  const nameById = new Map(inPlayDecks.map((d) => [d.id, d.name]))
  const labelFor = (id: string) => nameById.get(id) ?? id

  const keyboard = useKeyboardReorder(ids, onReorder, announce, labelFor)
  const drag = useDragReorder({ ids, onReorder, onDropOutside: onRemove, announce, labelFor, axis: 'horizontal' })
  const flip = useFlip(ids)
  const draggingId = ids.find((id) => drag.isDragging(id)) ?? null
  const ghost = useDragGhost(draggingId !== null)

  useEffect(() => {
    onDropZoneChange?.(drag.dropZone)
  }, [onDropZoneChange, drag.dropZone])

  const chipsClass = drag.isOverContainer ? 'deck-table__chips' : 'deck-table__chips deck-table__chips--drag-leaving'
  const caretIndex = drag.previewIndex ?? incomingPreviewIndex ?? null
  const showCaret = caretIndex !== null && !prefersReducedMotion()

  return (
    <div className="deck-table">
      {draggingId && (
        <DragGhost
          position={ghost.position}
          label={labelFor(draggingId)}
          outcomeText={drag.previewIndex !== null ? 'Move here' : 'Remove from table'}
          refused={false}
        />
      )}
      <div className={chipsClass} ref={drag.containerRef}>
        {inPlayDecks.length === 0 && <span className="deck-table__empty">No decks on the table</span>}
        {inPlayDecks.map((deck, index) => (
          <Fragment key={deck.id}>
            {showCaret && caretIndex === index && <span className="insertion-caret insertion-caret--horizontal" />}
            <div
              className="deck-table__item"
              ref={(el) => {
                drag.itemRef(deck.id)(el)
                flip.itemRef(deck.id)(el)
              }}
            >
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
          </Fragment>
        ))}
        {showCaret && caretIndex === inPlayDecks.length && <span className="insertion-caret insertion-caret--horizontal" />}
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
