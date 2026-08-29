import { useState } from 'react'
import { DeckChip } from './DeckChip'
import { useDragReorder } from '../decks/dnd/useDragReorder'
import { useKeyboardReorder } from '../decks/dnd/useKeyboardReorder'
import type { Deck } from '../decks/types'

export interface DeckRailCardDrop {
  /** Registers an element as a drop target for the currently-dragged flashcard — see decks/dnd/useCardDrag.ts. */
  targetRef: (deckId: string) => (el: HTMLElement | null) => void
  /** The deck id currently under the dragged card, if any — drives the accept/refuse hover style. */
  overId: string | null
}

/**
 * The library (issue #187 stage 4): "Reference" (the read-only virtual
 * dictionary deck) and "My decks" (user decks — create, rename, delete, and
 * reorder). Reordering reuses the same pointer/keyboard hooks the table
 * uses (decks/dnd) since it's the same "one reorderable list" shape; there's
 * no `onDropOutside` wired up here, so a rail item dropped outside the rail
 * just snaps back — moving a deck onto the table is its own explicit
 * "+ Add to table" control (already keyboard/pointer-accessible on its own,
 * so rail-to-table drag was left out — see the stage 3 commit).
 *
 * `cardDrop`, when given, also makes every row a drop target for the
 * currently-showing flashcard (FlashcardsView's useCardDrag) — dragging a
 * card onto the dictionary row is still refused there, just visually
 * distinguished from a row that will actually accept it.
 */
export function DeckRail({
  dictionaryDeck,
  userDecks,
  inPlayIds,
  onAddToTable,
  onCreateDeck,
  onRenameDeck,
  onDeleteDeck,
  onReorderDecks,
  onOpenBrowseDrawer,
  announce,
  cardDrop,
}: {
  dictionaryDeck: Deck
  userDecks: Deck[]
  inPlayIds: string[]
  onAddToTable: (deckId: string) => void
  onCreateDeck: (name: string) => void
  onRenameDeck: (deckId: string, name: string) => void
  onDeleteDeck: (deckId: string) => void
  onReorderDecks: (orderedIds: string[]) => void
  onOpenBrowseDrawer: () => void
  announce: (message: string) => void
  cardDrop?: DeckRailCardDrop
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const userIds = userDecks.map((d) => d.id)
  const nameById = new Map(userDecks.map((d) => [d.id, d.name]))
  const labelFor = (id: string) => nameById.get(id) ?? id

  const keyboard = useKeyboardReorder(userIds, onReorderDecks, announce, labelFor)
  const drag = useDragReorder({ ids: userIds, onReorder: onReorderDecks, announce, labelFor, axis: 'vertical' })

  function startRename(deck: Deck) {
    setRenamingId(deck.id)
    setRenameValue(deck.name)
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) onRenameDeck(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  function handleCreate() {
    const name = window.prompt('Name this deck:')
    if (name && name.trim()) onCreateDeck(name.trim())
  }

  function handleDelete(deck: Deck) {
    if (window.confirm(`Delete "${deck.name}"? This can't be undone.`)) onDeleteDeck(deck.id)
  }

  function rowClass(deckId: string, isVirtual: boolean): string {
    if (cardDrop?.overId !== deckId) return 'deck-rail__row'
    return isVirtual ? 'deck-rail__row deck-rail__row--refuse' : 'deck-rail__row deck-rail__row--accept'
  }

  return (
    <div className="deck-rail">
      <section className="deck-rail__section">
        <h3 className="deck-rail__heading">Reference</h3>
        <div className={rowClass(dictionaryDeck.id, true)} ref={cardDrop?.targetRef(dictionaryDeck.id)}>
          <DeckChip deck={dictionaryDeck} />
          <span className="deck-rail__badge">Read-only</span>
          {!inPlayIds.includes(dictionaryDeck.id) && (
            <button
              type="button"
              className="deck-rail__action"
              aria-label={`Add ${dictionaryDeck.name} to the table`}
              onClick={() => onAddToTable(dictionaryDeck.id)}
            >
              + Table
            </button>
          )}
        </div>
      </section>

      <section className="deck-rail__section">
        <h3 className="deck-rail__heading">My decks</h3>
        {userDecks.length === 0 && (
          <p className="deck-rail__empty">No decks yet — create one to start organizing your review sessions.</p>
        )}
        <div ref={drag.containerRef}>
          {userDecks.map((deck) => (
            <div
              key={deck.id}
              className={rowClass(deck.id, false)}
              ref={(el) => {
                drag.itemRef(deck.id)(el)
                cardDrop?.targetRef(deck.id)(el)
              }}
            >
              {renamingId === deck.id ? (
                <input
                  className="deck-rail__rename-input"
                  aria-label={`New name for ${deck.name}`}
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <DeckChip
                  deck={deck}
                  drag={{
                    grabbed: keyboard.isGrabbed(deck.id),
                    dragging: drag.isDragging(deck.id),
                    onPointerDown: drag.onPointerDown(deck.id),
                    onKeyDown: (e) => keyboard.handleKeyDown(deck.id, e),
                  }}
                />
              )}
              <button type="button" className="deck-rail__action" aria-label={`Rename ${deck.name}`} onClick={() => startRename(deck)}>
                Rename
              </button>
              <button type="button" className="deck-rail__action" aria-label={`Delete ${deck.name}`} onClick={() => handleDelete(deck)}>
                Delete
              </button>
              {!inPlayIds.includes(deck.id) && (
                <button
                  type="button"
                  className="deck-rail__action"
                  aria-label={`Add ${deck.name} to the table`}
                  onClick={() => onAddToTable(deck.id)}
                >
                  + Table
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="deck-rail__create" onClick={handleCreate}>
          + New deck
        </button>
      </section>

      <button type="button" className="deck-rail__browse" onClick={onOpenBrowseDrawer}>
        Browse dictionary…
      </button>
    </div>
  )
}
