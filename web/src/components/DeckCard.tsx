import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { DeckMenu } from './DeckMenu'
import type { DeckMenuActions } from './DeckMenu'
import type { DeckStats } from '../decks/stats'
import type { Deck } from '@teochew/core'

export interface DeckCardRename {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** How a deck row is reacting to a card being dragged over it right now. */
export type CardDropState = 'accept' | 'refuse' | null

/**
 * A deck as it appears in the library rail: a card with the deck's hue down
 * its left edge, a grip, its size, and either how much of it is due or the
 * fact that it's already on the table.
 *
 * The whole card is the drag source rather than a dedicated handle — a deck
 * card is big enough to grab anywhere, and the two controls that must stay
 * clickable (the options menu, the rename input) are excluded explicitly in
 * `startDrag` below. That differs from the table's chips only in size, not
 * in behaviour.
 */
export function DeckCard({
  deck,
  stats,
  inPlay,
  elementRef,
  dragging,
  lifted,
  cardDrop,
  renaming,
  menuActions,
  onPointerDown,
  onKeyDown,
  onRenameRequest,
}: {
  deck: Deck
  stats: DeckStats
  inPlay: boolean
  elementRef: (el: HTMLElement | null) => void
  /** True while this card is the one in the air — its slot is left as a placeholder. */
  dragging: boolean
  /** True while this card is held by the keyboard. */
  lifted: boolean
  cardDrop: CardDropState
  renaming: DeckCardRename | null
  /** Omitted for the read-only dictionary, which has nothing to rename, duplicate, or delete. */
  menuActions: DeckMenuActions | null
  onPointerDown: (e: ReactPointerEvent) => void
  onKeyDown: (e: ReactKeyboardEvent) => void
  onRenameRequest: () => void
}) {
  const isVirtual = deck.kind === 'virtual'
  const size = deck.cards.length
  const unit = isVirtual ? (size === 1 ? 'entry' : 'entries') : size === 1 ? 'card' : 'cards'

  const classes = ['deck']
  if (isVirtual) classes.push('deck--virtual')
  if (inPlay) classes.push('deck--inplay')
  if (dragging) classes.push('is-source')
  if (lifted) classes.push('kbd-lift')
  if (cardDrop === 'accept') classes.push('drop-ok')
  if (cardDrop === 'refuse') classes.push('drop-no')

  function startDrag(e: ReactPointerEvent) {
    // The options menu and the rename field are inside the drag source, so a
    // press on either has to stay a press.
    if ((e.target as HTMLElement).closest('button, input')) return
    onPointerDown(e)
  }

  const label = `${deck.name}, ${size.toLocaleString()} ${unit}${inPlay ? ', on the table' : ', in the library'}`

  return (
    <div
      className={classes.join(' ')}
      style={{ ['--hue' as string]: `var(--deck-hue-${deck.hue}-bg)` }}
      ref={elementRef}
      data-drag-source=""
      data-deck-id={deck.id}
      data-place="rail"
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => menuActions && onRenameRequest()}
    >
      <div className="deck__grip" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <div className="deck__body">
        {renaming ? (
          <input
            className="deck__rename"
            aria-label={`New name for ${deck.name}`}
            value={renaming.value}
            autoFocus
            onChange={(e) => renaming.onChange(e.target.value)}
            onBlur={renaming.onCommit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') renaming.onCommit()
              if (e.key === 'Escape') renaming.onCancel()
            }}
          />
        ) : (
          <div className="deck__name">{deck.name}</div>
        )}
        <div className="deck__meta">
          <span className="mono">
            {size.toLocaleString()} {unit}
          </span>
          {inPlay ? (
            <span className="deck__played">on the table</span>
          ) : (
            stats.due > 0 && (
              <>
                <span className="deck__dot" aria-hidden="true" />
                <span className="mono">{stats.due.toLocaleString()} due</span>
              </>
            )
          )}
        </div>
      </div>

      <div className="deck__tail">{menuActions && <DeckMenu deckName={deck.name} inPlay={inPlay} actions={menuActions} />}</div>
    </div>
  )
}
