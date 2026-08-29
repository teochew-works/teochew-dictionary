import { Fragment, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { DeckCard } from './DeckCard'
import type { CardDropState } from './DeckCard'
import type { DeckMenuActions } from './DeckMenu'
import type { DeckStats } from '../decks/stats'
import type { Deck } from '../decks/types'

export interface DeckRailRename {
  deckId: string
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

/**
 * The library: "Reference" (the read-only dictionary) above "My decks"
 * (create, rename, duplicate, delete, reorder). Decks are dragged out of
 * here and laid on the table to enter a session — the rail is where a deck
 * lives when it isn't being practised.
 *
 * The trash only materialises while a deck is in the air, so the rail isn't
 * carrying a destructive control the rest of the time; deleting is
 * reversible from the toast it produces, which is why nothing here asks for
 * confirmation first.
 */
export function DeckRail({
  dictionaryDeck,
  userDecks,
  statsById,
  inPlayIds,
  libraryRef,
  trashRef,
  itemRef,
  dictionaryRef,
  caretIndex,
  libraryOver,
  trashArmed,
  trashOver,
  trashLabel,
  isDragging,
  isLifted,
  cardDropFor,
  renaming,
  menuActionsFor,
  onPointerDown,
  onKeyDown,
  onRenameRequest,
  onCreateDeck,
}: {
  dictionaryDeck: Deck
  userDecks: Deck[]
  statsById: Map<string, DeckStats>
  inPlayIds: string[]
  libraryRef: (el: HTMLElement | null) => void
  trashRef: (el: HTMLElement | null) => void
  /** One ref per user deck, composed by the caller (drag source, FLIP, and card drop target) and stable across renders. */
  itemRef: (deckId: string) => (el: HTMLElement | null) => void
  /** The dictionary row is a card drop target but never reorders, so it takes its own ref. */
  dictionaryRef: (el: HTMLElement | null) => void
  caretIndex: number | null
  libraryOver: boolean
  /** True while something the trash can act on is in the air — the only time it exists. */
  trashArmed: boolean
  trashOver: boolean
  /** What releasing here would do: delete the deck, or take a card out of one. */
  trashLabel: string
  isDragging: (deckId: string) => boolean
  isLifted: (deckId: string) => boolean
  cardDropFor: (deckId: string) => CardDropState
  renaming: DeckRailRename | null
  menuActionsFor: (deck: Deck) => DeckMenuActions
  onPointerDown: (deckId: string) => (e: ReactPointerEvent) => void
  onKeyDown: (deckId: string, e: ReactKeyboardEvent) => void
  onRenameRequest: (deck: Deck) => void
  onCreateDeck: () => void
}) {
  const [open, setOpen] = useState(true)

  const statsFor = (deck: Deck): DeckStats =>
    statsById.get(deck.id) ?? { total: deck.cards.length, kept: 0, due: 0, fresh: 0, learned: 0 }

  const trashClasses = ['trash']
  if (trashArmed) trashClasses.push('trash--armed')
  if (trashOver) trashClasses.push('is-over')

  return (
    <aside className={open ? 'rail' : 'rail rail--closed'} aria-label="Deck library">
      <div className="rail__top">
        <button
          type="button"
          className="rail__toggle"
          aria-label={open ? 'Collapse the deck library' : 'Expand the deck library'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <path d="M2 3h11M2 7.5h11M2 12h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <span className="eyebrow rail__hideable">Library</span>
      </div>

      <div className="rail__hideable">
        <div className="rail__section">
          <span className="eyebrow">Reference</span>
        </div>
      </div>
      <div className="rail__list">
        <DeckCard
          deck={dictionaryDeck}
          stats={statsFor(dictionaryDeck)}
          inPlay={inPlayIds.includes(dictionaryDeck.id)}
          elementRef={dictionaryRef}
          dragging={isDragging(dictionaryDeck.id)}
          lifted={isLifted(dictionaryDeck.id)}
          cardDrop={cardDropFor(dictionaryDeck.id)}
          renaming={null}
          menuActions={null}
          onPointerDown={onPointerDown(dictionaryDeck.id)}
          onKeyDown={(e) => onKeyDown(dictionaryDeck.id, e)}
          onRenameRequest={() => undefined}
        />
      </div>

      <div className="rail__section rail__hideable">
        <span className="eyebrow">My decks</span>
        <button type="button" className="rail__add" onClick={onCreateDeck}>
          + New
        </button>
      </div>

      <div className={libraryOver ? 'rail__list rail__list--over' : 'rail__list'} ref={libraryRef}>
        {userDecks.length === 0 && (
          <p className="rail__empty">No decks yet — create one, or drop a card here to start one.</p>
        )}
        {userDecks.map((deck, index) => (
          <Fragment key={deck.id}>
            {caretIndex === index && <span className="caret caret--horizontal" />}
            <DeckCard
              deck={deck}
              stats={statsFor(deck)}
              inPlay={inPlayIds.includes(deck.id)}
              elementRef={itemRef(deck.id)}
              dragging={isDragging(deck.id)}
              lifted={isLifted(deck.id)}
              cardDrop={cardDropFor(deck.id)}
              renaming={
                renaming?.deckId === deck.id
                  ? {
                      value: renaming.value,
                      onChange: renaming.onChange,
                      onCommit: renaming.onCommit,
                      onCancel: renaming.onCancel,
                    }
                  : null
              }
              menuActions={menuActionsFor(deck)}
              onPointerDown={onPointerDown(deck.id)}
              onKeyDown={(e) => onKeyDown(deck.id, e)}
              onRenameRequest={() => onRenameRequest(deck)}
            />
          </Fragment>
        ))}
        {caretIndex === userDecks.length && <span className="caret caret--horizontal" />}
      </div>

      <p className="rail__hint rail__hideable">
        Drag a deck onto the table to put it in play. By keyboard: focus a deck, <kbd>Space</kbd> to lift,{' '}
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <kbd>→</kbd> to move, <kbd>Space</kbd> to drop.
      </p>

      <div className="rail__spacer" />

      <div className={trashClasses.join(' ')} ref={trashRef} aria-hidden={!trashArmed}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path
            d="M3 4h9M6 4V2.6h3V4M4.2 4l.6 8.4h5.4L10.8 4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {trashLabel}
      </div>
    </aside>
  )
}
