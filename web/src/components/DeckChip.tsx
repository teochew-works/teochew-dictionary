import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { Deck } from '../decks/types'

export interface DeckChipDrag {
  grabbed: boolean
  dragging: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onKeyDown: (e: ReactKeyboardEvent) => void
}

/**
 * A deck pill: hue swatch, name, and card count. Used on the table (and,
 * from issue #187 stage 4, the library rail) — one component so a deck
 * reads the same wherever it appears.
 *
 * `drag`, when given, renders a dedicated grip handle rather than making
 * the whole chip a pointer-drag source — otherwise a pointerdown meant for
 * the remove button would also start a drag. It carries both the pointer
 * handler and the keyboard handler for decks/dnd/useKeyboardReorder.ts's
 * lift/arrow/drop/escape pattern, since both act on the same handle.
 */
export function DeckChip({
  deck,
  onRemove,
  removeLabel,
  drag,
}: {
  deck: Deck
  onRemove?: () => void
  removeLabel?: string
  drag?: DeckChipDrag
}) {
  const classes = ['deck-chip', `deck-chip--${deck.hue}`]
  if (drag?.dragging) classes.push('deck-chip--dragging')
  if (drag?.grabbed) classes.push('deck-chip--grabbed')

  return (
    <span className={classes.join(' ')}>
      {drag && (
        <button
          type="button"
          className="deck-chip__handle"
          aria-label={`Reorder ${deck.name}`}
          aria-pressed={drag.grabbed}
          onPointerDown={drag.onPointerDown}
          onKeyDown={drag.onKeyDown}
        >
          ⠿
        </button>
      )}
      <span className="deck-chip__name">{deck.name}</span>
      <span className="deck-chip__count">{deck.cards.length.toLocaleString()}</span>
      {onRemove && (
        <button
          type="button"
          className="deck-chip__remove"
          aria-label={removeLabel ?? `Remove ${deck.name} from the table`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  )
}
