import type { Deck } from '../decks/types'

/**
 * A deck pill: hue swatch, name, and card count. Used on the table (and,
 * from issue #187 stage 3/4, the library rail) — one component so a deck
 * reads the same wherever it appears.
 */
export function DeckChip({ deck, onRemove, removeLabel }: { deck: Deck; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span className={`deck-chip deck-chip--${deck.hue}`}>
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
