import { Fragment, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { TableChip } from './TableChip'
import type { CardDropState } from './DeckCard'
import type { DeckStats } from '../decks/stats'
import type { Deck } from '@teochew/core'

export interface TrayTotals {
  /** Cards the session actually drew from, after every filter. */
  pool: number
  due: number
  fresh: number
  learned: number
}

/**
 * "The table": the decks in play, and what they add up to. Everything here
 * is shuffled into one review queue, so putting four decks in play is the
 * same gesture as putting one.
 *
 * The tray is a standing drop zone with its own empty state rather than a
 * bare row of chips — it has to be a target you can aim at before there is
 * anything in it, since dragging the first deck out of the library is the
 * whole point of the screen.
 */
export function DeckTray({
  inPlayDecks,
  statsById,
  totals,
  trayRef,
  itemRef,
  isOver,
  caretIndex,
  isDragging,
  isLifted,
  cardDropFor,
  onRemove,
  onPointerDown,
  onKeyDown,
  children,
}: {
  inPlayDecks: Deck[]
  statsById: Map<string, DeckStats>
  totals: TrayTotals
  trayRef: (el: HTMLElement | null) => void
  /** One ref per chip, composed by the caller (drag source, FLIP, and card drop target) and stable across renders. */
  itemRef: (deckId: string) => (el: HTMLElement | null) => void
  /** True while a deck is being dragged over the tray — lights the whole zone, not just the gap. */
  isOver: boolean
  /** Where a deck would land right now, or null. */
  caretIndex: number | null
  isDragging: (deckId: string) => boolean
  isLifted: (deckId: string) => boolean
  cardDropFor: (deckId: string) => CardDropState
  onRemove: (deckId: string) => void
  onPointerDown: (deckId: string) => (e: ReactPointerEvent) => void
  onKeyDown: (deckId: string, e: ReactKeyboardEvent) => void
  /** The saved-group row, rendered under the tray. */
  children?: ReactNode
}) {
  const trayClasses = ['tray']
  if (isOver) trayClasses.push('is-over')
  if (inPlayDecks.length === 0) trayClasses.push('is-empty')

  // Open by default above the phone breakpoint (desktop/tablet keep the tray
  // always visible); closed by default at phone width, where "on the table"
  // collapses to this one-line summary until tapped open (mobile.md §3.4).
  // Same read-once-at-mount convention as DictionaryView's filters disclosure.
  const [trayOpenOnPhone, setTrayOpenOnPhone] = useState(() => window.innerWidth > 640)

  return (
    <section className={trayOpenOnPhone ? 'table table--tray-open' : 'table'} aria-label="Decks in play">
      <button
        type="button"
        className="table__head"
        aria-expanded={trayOpenOnPhone}
        onClick={() => setTrayOpenOnPhone((v) => !v)}
      >
        <span className="eyebrow">On the table</span>
        <div className="table__totals">
          {inPlayDecks.length === 0 ? (
            <span>Nothing in play</span>
          ) : (
            <>
              <b className="mono">{totals.pool.toLocaleString()}</b>
              <span>
                cards from {inPlayDecks.length} deck{inPlayDecks.length === 1 ? '' : 's'}
              </span>
              <span className="table__pips">
                <span className="pip pip--due mono">{totals.due.toLocaleString()} due</span>
                <span className="pip pip--new mono">{totals.fresh.toLocaleString()} new</span>
                <span className="pip pip--seen mono">{totals.learned.toLocaleString()} learned</span>
              </span>
            </>
          )}
        </div>
      </button>

      <div className={trayClasses.join(' ')} ref={trayRef}>
        <div className="tray__empty">
          <svg width="26" height="20" viewBox="0 0 26 20" fill="none" aria-hidden="true">
            <rect x="1.8" y="4.5" width="13" height="14" rx="2.2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M8.5 3.2h13a2 2 0 0 1 2 2v11"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeDasharray="2.6 2.6"
            />
          </svg>
          <span>Drag decks here to practise them together</span>
        </div>

        {inPlayDecks.map((deck, index) => (
          <Fragment key={deck.id}>
            {caretIndex === index && <span className="caret" />}
            <TableChip
              deck={deck}
              stats={statsById.get(deck.id) ?? { total: deck.cards.length, kept: 0, due: 0, fresh: 0, learned: 0 }}
              elementRef={itemRef(deck.id)}
              dragging={isDragging(deck.id)}
              lifted={isLifted(deck.id)}
              cardDrop={cardDropFor(deck.id)}
              onRemove={() => onRemove(deck.id)}
              onPointerDown={onPointerDown(deck.id)}
              onKeyDown={(e) => onKeyDown(deck.id, e)}
            />
          </Fragment>
        ))}
        {caretIndex === inPlayDecks.length && <span className="caret" />}
      </div>

      {children}
    </section>
  )
}
