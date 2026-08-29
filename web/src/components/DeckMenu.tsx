import { useId, useRef, useState } from 'react'
import { useDismissOnOutside } from './useDismissOnOutside'

export interface DeckMenuActions {
  onPutOnTable: () => void
  onViewCards: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}

/**
 * The per-deck options menu behind a deck card's kebab (issue #189's
 * prototype parity pass), replacing the row of always-visible
 * Rename/Delete/+ Table links: with four decks in the rail those links
 * wrapped onto three lines each and buried the deck names they belonged to.
 *
 * Deleting from here takes effect immediately and offers Undo in the
 * resulting toast, rather than asking for confirmation first — the same
 * bargain the trash drop zone makes, and the reason this screen needs no
 * confirmation dialog at all.
 */
export function DeckMenu({ deckName, inPlay, actions }: { deckName: string; inPlay: boolean; actions: DeckMenuActions }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useDismissOnOutside(open, () => setOpen(false), [panelRef, triggerRef])

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="deck-menu">
      <button
        type="button"
        ref={triggerRef}
        className="deck-menu__trigger"
        aria-label={`Options for ${deckName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
          <circle cx="6.5" cy="2.6" r="1.2" fill="currentColor" />
          <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" />
          <circle cx="6.5" cy="10.4" r="1.2" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="deck-menu__panel pop" role="menu" aria-label={`${deckName} options`} ref={panelRef}>
          <button type="button" role="menuitem" className="pop__item" disabled={inPlay} onClick={() => run(actions.onPutOnTable)}>
            Put on the table
          </button>
          <button type="button" role="menuitem" className="pop__item" onClick={() => run(actions.onViewCards)}>
            View cards
          </button>
          <button type="button" role="menuitem" className="pop__item" onClick={() => run(actions.onRename)}>
            Rename
          </button>
          <button type="button" role="menuitem" className="pop__item" onClick={() => run(actions.onDuplicate)}>
            Duplicate
          </button>
          <button type="button" role="menuitem" className="pop__item pop__item--danger" onClick={() => run(actions.onDelete)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
