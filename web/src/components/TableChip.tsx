import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { sliceLabel } from '../decks/stats'
import type { DeckStats } from '../decks/stats'
import type { CardDropState } from './DeckCard'
import type { Deck } from '@teochew/core'

/**
 * A deck laid on the table. Drawn as a small pile of cards (the stacked
 * edges are CSS pseudo-elements) so "on the table" reads as a physical
 * state rather than another tag in a list.
 *
 * Carries what the session actually drew from this deck: how much is due,
 * how much is new, and — only when the filters removed something — how much
 * of the deck survived them.
 */
export function TableChip({
  deck,
  stats,
  elementRef,
  dragging,
  lifted,
  cardDrop,
  onRemove,
  onPointerDown,
  onKeyDown,
}: {
  deck: Deck
  stats: DeckStats
  elementRef: (el: HTMLElement | null) => void
  dragging: boolean
  lifted: boolean
  cardDrop: CardDropState
  onRemove: () => void
  onPointerDown: (e: ReactPointerEvent) => void
  onKeyDown: (e: ReactKeyboardEvent) => void
}) {
  const classes = ['chip']
  if (dragging) classes.push('is-source')
  if (lifted) classes.push('kbd-lift')
  if (cardDrop === 'accept') classes.push('drop-ok')
  if (cardDrop === 'refuse') classes.push('drop-no')

  const slice = sliceLabel(stats)

  function startDrag(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    onPointerDown(e)
  }

  return (
    <div
      className={classes.join(' ')}
      style={{ ['--hue' as string]: `var(--deck-hue-${deck.hue}-bg)` }}
      ref={elementRef}
      data-drag-source=""
      data-deck-id={deck.id}
      data-place="tray"
      role="button"
      tabIndex={0}
      aria-label={`${deck.name} on the table, ${slice}`}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
    >
      <div className="chip__bar" aria-hidden="true" />
      <div className="chip__name">{deck.name}</div>
      <div className="chip__stat">
        <span className="mono">{stats.due.toLocaleString()} due</span>
        <span className="mono">{stats.fresh.toLocaleString()} new</span>
      </div>
      <div className="chip__slice">{slice}</div>
      <button type="button" className="chip__x" aria-label={`Take ${deck.name} off the table`} onClick={onRemove}>
        <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
          <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
