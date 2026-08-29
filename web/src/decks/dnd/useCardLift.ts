import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface CardLift {
  liftedId: string | null
  isLifted: (entryId: string) => boolean
  handleKeyDown: (entryId: string, e: ReactKeyboardEvent) => void
}

/**
 * The keyboard equivalent of dragging a card around inside its own deck:
 * space lifts the focused card, arrows move it, space drops it, escape puts it
 * back. The same lift/move/drop/cancel shape decks use (see useDeckLift), for
 * the one list that decks don't cover.
 *
 * Both axes move by one position rather than by a row, because the list wraps:
 * "the card after this one" is well defined at any width, whereas "the card
 * below" depends on how many happen to fit on a line.
 *
 * Escape restores by moving the card back to the index it was lifted from,
 * which is enough — it is the only card that moved.
 */
export function useCardLift(
  entryIds: string[],
  onReorder: (entryId: string, index: number) => void,
  announce: (message: string) => void,
  labelFor: (entryId: string) => string,
): CardLift {
  const [liftedId, setLiftedId] = useState<string | null>(null)
  const liftedFromRef = useRef<number | null>(null)

  const handleKeyDown = useCallback(
    (entryId: string, e: ReactKeyboardEvent) => {
      const index = entryIds.indexOf(entryId)
      if (index === -1) return

      if (e.key === ' ') {
        e.preventDefault()
        if (liftedId === entryId) {
          setLiftedId(null)
          liftedFromRef.current = null
          announce(`Dropped ${labelFor(entryId)} at position ${index + 1} of ${entryIds.length}.`)
        } else {
          setLiftedId(entryId)
          liftedFromRef.current = index
          announce(`Picked up ${labelFor(entryId)}. Arrow keys move it, space drops it, escape cancels.`)
        }
        return
      }

      if (liftedId !== entryId) return

      if (e.key === 'Escape') {
        e.preventDefault()
        const from = liftedFromRef.current
        setLiftedId(null)
        liftedFromRef.current = null
        if (from !== null && from !== index) onReorder(entryId, from)
        announce(`Cancelled — ${labelFor(entryId)} is back where it started.`)
        return
      }

      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
      if (!back && !forward) return

      e.preventDefault()
      const to = back ? index - 1 : index + 1
      if (to < 0 || to >= entryIds.length) return

      onReorder(entryId, to)
      announce(`Moved ${labelFor(entryId)} to position ${to + 1} of ${entryIds.length}.`)
    },
    [entryIds, liftedId, onReorder, announce, labelFor],
  )

  return { liftedId, isLifted: (entryId) => liftedId === entryId, handleKeyDown }
}
