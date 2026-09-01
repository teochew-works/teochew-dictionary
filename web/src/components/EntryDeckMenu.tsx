import { useId, useRef } from 'react'
import { AnchoredPopover } from './AnchoredPopover'
import { useDismissOnOutside } from './useDismissOnOutside'
import type { RefObject } from 'react'
import type { Deck } from '@teochew/core'

/**
 * Which decks hold this card, and the pointer- and keyboard-native way to
 * change that — so filing a card never *requires* a drag (issue #187's "drag
 * is not the only way"), and neither does taking one back out.
 *
 * The deck items are checkboxes rather than commands: ticking adds, unticking
 * removes, and the menu stays open through both, because its job is to edit a
 * card's membership across several decks rather than to run one action. That
 * is also the copy gesture a pointer drag can't offer — ticking a second deck
 * without unticking the first leaves the card in both.
 *
 * Opened from a browse-drawer entry, a deck-contents row, or the study card's
 * filing handle.
 */
export function EntryDeckMenu({
  headword,
  entryId,
  userDecks,
  anchorRef,
  align = 'left',
  onAddCard,
  onRemoveCard,
  onNewDeck,
  onClose,
}: {
  headword: string
  entryId: string
  userDecks: Deck[]
  /** The row or button this hangs off — the panel is portalled, so it positions from this. */
  anchorRef: RefObject<HTMLElement | null>
  /** Which edge to hang the panel from, so it doesn't run off the side of its anchor. */
  align?: 'left' | 'right'
  onAddCard: (deckId: string) => void
  onRemoveCard: (deckId: string) => void
  onNewDeck: () => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const labelId = useId()

  useDismissOnOutside(true, onClose, [panelRef])

  return (
    <AnchoredPopover anchorRef={anchorRef} align={align} className="pop entry-deck-menu" role="menu" aria-labelledby={labelId}>
      <div ref={panelRef} className="pop__items">
      <div className="eyebrow" id={labelId}>
        Decks for {headword}
      </div>

      {userDecks.length === 0 && <p className="pop__note">No decks yet.</p>}

      {userDecks.map((deck) => {
        const has = deck.cards.includes(entryId)
        return (
          <button
            key={deck.id}
            type="button"
            role="menuitemcheckbox"
            aria-checked={has}
            className="pop__item pop__item--check"
            onClick={() => (has ? onRemoveCard(deck.id) : onAddCard(deck.id))}
          >
            <span className="pop__tick" aria-hidden="true">
              {has ? '✓' : ''}
            </span>
            {deck.name}
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
    </AnchoredPopover>
  )
}
