import { Fragment, useEffect, useState } from 'react'
import { DeckChip } from './DeckChip'
import { DragGhost } from './DragGhost'
import { DeleteConfirm } from './DeleteConfirm'
import { useDragReorder } from '../decks/dnd/useDragReorder'
import type { DropZoneHandle } from '../decks/dnd/useDragReorder'
import { useKeyboardReorder } from '../decks/dnd/useKeyboardReorder'
import { useDragGhost } from '../decks/dnd/useDragGhost'
import { useFlip } from '../decks/dnd/useFlip'
import { prefersReducedMotion } from '../decks/dnd/prefersReducedMotion'
import type { Deck } from '../decks/types'

export interface DeckRailCardDrop {
  /** Registers an element as a drop target for the currently-dragged flashcard — see decks/dnd/useCardDrag.ts. */
  targetRef: (deckId: string) => (el: HTMLElement | null) => void
  /** The deck id currently under the dragged card, if any — drives the accept/refuse hover style. */
  overId: string | null
}

export interface DeckRailCrossListDrop {
  /** The target list's own drop-zone handle (e.g. DeckTable's `drag.dropZone`) — see decks/dnd/useDragReorder.ts. */
  dropZone: DropZoneHandle
  /** Human-readable name of the target list, e.g. 'the table'. */
  zoneLabel: string
  /** The keyboard shortcut (while a rail item is grabbed) that moves it to the target. Defaults to 't'. */
  moveKey?: string
  /** Called on drop (pointer, with an insertion index) or keyboard move (no index — always appends). */
  onMove: (deckId: string, index?: number) => void
  /** Where a dragged deck would land in the target list right now — lets the target render its own insertion caret, since it's a different component/hook instance. */
  onPreviewChange?: (index: number | null) => void
}

/**
 * The library (issue #187 stage 4): "Reference" (the read-only virtual
 * dictionary deck) and "My decks" (user decks — create, rename, delete, and
 * reorder). Reordering reuses the same pointer/keyboard hooks the table
 * uses (decks/dnd) since it's the same "one reorderable list" shape.
 *
 * `crossListDrop`, when given (issue #189), lets a "My decks" row also be
 * dragged onto — or keyboard-moved into — a different list entirely (the
 * table): the same drag/keyboard hooks used for rail-internal reordering
 * recognize that second drop location via `crossListTarget`. The "+ Table"
 * button stays as a simple pointer/click-only shortcut alongside it.
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
  crossListDrop,
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
  crossListDrop?: DeckRailCrossListDrop
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [createValue, setCreateValue] = useState('')

  const userIds = userDecks.map((d) => d.id)
  const nameById = new Map(userDecks.map((d) => [d.id, d.name]))
  const labelFor = (id: string) => nameById.get(id) ?? id

  const keyboard = useKeyboardReorder(
    userIds,
    onReorderDecks,
    announce,
    labelFor,
    crossListDrop && { zoneLabel: crossListDrop.zoneLabel, moveKey: crossListDrop.moveKey, onMove: (id) => crossListDrop.onMove(id) },
  )
  const drag = useDragReorder({
    ids: userIds,
    onReorder: onReorderDecks,
    announce,
    labelFor,
    axis: 'vertical',
    crossListTarget: crossListDrop && {
      dropZone: crossListDrop.dropZone,
      axis: 'horizontal',
      zoneLabel: crossListDrop.zoneLabel,
      onDrop: crossListDrop.onMove,
    },
  })
  const flip = useFlip(userIds)
  const draggingId = userIds.find((id) => drag.isDragging(id)) ?? null
  const ghost = useDragGhost(draggingId !== null)
  const draggingDeck = userDecks.find((d) => d.id === draggingId)

  useEffect(() => {
    crossListDrop?.onPreviewChange?.(drag.crossListPreviewIndex)
  }, [crossListDrop, drag.crossListPreviewIndex])

  const outcomeText =
    drag.previewIndex !== null
      ? 'Move here'
      : drag.crossListPreviewIndex !== null && crossListDrop
        ? `+${draggingDeck?.cards.length ?? 0} cards`
        : "Can't drop here"
  const refused = draggingId !== null && drag.previewIndex === null && drag.crossListPreviewIndex === null
  const showCaret = drag.previewIndex !== null && !prefersReducedMotion()

  function startRename(deck: Deck) {
    setRenamingId(deck.id)
    setRenameValue(deck.name)
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) onRenameDeck(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  function commitCreate() {
    if (createValue.trim()) onCreateDeck(createValue.trim())
    setCreating(false)
    setCreateValue('')
  }

  function rowClass(deckId: string, isVirtual: boolean): string {
    if (cardDrop?.overId !== deckId) return 'deck-rail__row'
    return isVirtual ? 'deck-rail__row deck-rail__row--refuse' : 'deck-rail__row deck-rail__row--accept'
  }

  return (
    <div className="deck-rail">
      {draggingId && <DragGhost position={ghost.position} label={labelFor(draggingId)} outcomeText={outcomeText} refused={refused} />}
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
          {userDecks.map((deck, index) => (
            <Fragment key={deck.id}>
              {showCaret && drag.previewIndex === index && <span className="insertion-caret insertion-caret--vertical" />}
              <div
                className={rowClass(deck.id, false)}
                ref={(el) => {
                  drag.itemRef(deck.id)(el)
                  flip.itemRef(deck.id)(el)
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
                <DeleteConfirm label={deck.name} onConfirm={() => onDeleteDeck(deck.id)} />
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
            </Fragment>
          ))}
          {showCaret && drag.previewIndex === userDecks.length && <span className="insertion-caret insertion-caret--vertical" />}
        </div>
        {creating ? (
          <input
            className="deck-rail__rename-input"
            aria-label="New deck name"
            value={createValue}
            autoFocus
            onChange={(e) => setCreateValue(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate()
              if (e.key === 'Escape') {
                setCreating(false)
                setCreateValue('')
              }
            }}
          />
        ) : (
          <button type="button" className="deck-rail__create" onClick={() => setCreating(true)}>
            + New deck
          </button>
        )}
      </section>

      <button type="button" className="deck-rail__browse" onClick={onOpenBrowseDrawer}>
        Browse dictionary…
      </button>
    </div>
  )
}
