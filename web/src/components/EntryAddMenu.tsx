import { useId, useRef } from 'react'
import { useDismissOnOutside } from './useDismissOnOutside'
import type { Deck } from '../decks/types'

/**
 * The pointer-only path into a deck for a dictionary entry, so filing a
 * card never *requires* a drag (issue #187's "drag is not the only way").
 * Opened by clicking or pressing Enter on a browse-drawer entry.
 */
export function EntryAddMenu({
  headword,
  entryId,
  userDecks,
  onAddCard,
  onNewDeck,
  onClose,
}: {
  headword: string
  entryId: string
  userDecks: Deck[]
  onAddCard: (deckId: string) => void
  onNewDeck: () => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const labelId = useId()

  useDismissOnOutside(true, onClose, [panelRef])

  return (
    <div className="pop entry-add-menu" role="menu" aria-labelledby={labelId} ref={panelRef}>
      <div className="eyebrow" id={labelId}>
        Add {headword} to
      </div>
      {userDecks.map((deck) => {
        const has = deck.cards.includes(entryId)
        return (
          <button
            key={deck.id}
            type="button"
            role="menuitem"
            className="pop__item"
            disabled={has}
            onClick={() => {
              onAddCard(deck.id)
              onClose()
            }}
          >
            {deck.name}
            {has && ' ✓'}
          </button>
        )
      })}
      <button
        type="button"
        role="menuitem"
        className="pop__item pop__item--accent"
        onClick={() => {
          onNewDeck()
          onClose()
        }}
      >
        + New deck with this card
      </button>
    </div>
  )
}
