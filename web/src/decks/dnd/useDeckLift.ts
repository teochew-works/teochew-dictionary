import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { moveItem } from './geometry'

/** Where the lifted deck currently is: still in the library, or on the table. */
export type LiftKind = 'deck' | 'chip'

export interface DeckLift {
  liftedId: string | null
  liftedKind: LiftKind | null
  isLifted: (kind: LiftKind, id: string) => boolean
  handleKeyDown: (kind: LiftKind, id: string, e: ReactKeyboardEvent) => void
}

export interface DeckLiftHandlers {
  onReorderLibrary: (orderedIds: string[]) => void
  onReorderPlay: (orderedIds: string[]) => void
  /** Put the deck on the table at `index`. */
  onPlay: (deckId: string, index: number) => void
  onTakeOff: (deckId: string) => void
  /** Escape: put both lists back exactly as they were when the deck was lifted. */
  onRestore: (libraryIds: string[], inPlayIds: string[]) => void
}

/**
 * The keyboard equivalent of every deck drag (issue #187's "drag is not the
 * only way", extended in #189 to cross the rail/table boundary): space
 * lifts the focused deck, arrows move it — including *between* the library
 * and the table — space drops it, escape puts it back.
 *
 * Crossing lists is an arrow key rather than a dedicated shortcut, because
 * the two lists are laid out as neighbours: right off the end of the
 * library is the table, and up off the table is the library. That keeps one
 * mental model ("arrows move the thing in the direction you press") instead
 * of asking the user to learn a separate key for the one move that matters
 * most.
 *
 * Every step is announced through the shared aria-live region, so a
 * screen-reader user hears the same outcome the drag badge shows a pointer
 * user.
 */
export function useDeckLift(
  libraryIds: string[],
  inPlayIds: string[],
  handlers: DeckLiftHandlers,
  announce: (message: string) => void,
  labelFor: (id: string) => string,
): DeckLift {
  const [lifted, setLifted] = useState<{ id: string; kind: LiftKind } | null>(null)
  const snapshotRef = useRef<{ libraryIds: string[]; inPlayIds: string[] } | null>(null)

  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const handleKeyDown = useCallback(
    (kind: LiftKind, id: string, e: ReactKeyboardEvent) => {
      const h = handlersRef.current

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (lifted?.id === id) {
          setLifted(null)
          snapshotRef.current = null
          announce(`Dropped ${labelFor(id)}.`)
        } else {
          setLifted({ id, kind })
          snapshotRef.current = { libraryIds, inPlayIds }
          announce(
            kind === 'deck'
              ? `Picked up ${labelFor(id)}. Right arrow puts it on the table, up and down reorder the library, space drops it, escape cancels.`
              : `Picked up ${labelFor(id)}. Left and right reorder the table, up takes it off, space drops it, escape cancels.`,
          )
        }
        return
      }

      if (lifted?.id !== id) return

      if (e.key === 'Escape') {
        e.preventDefault()
        const snapshot = snapshotRef.current
        setLifted(null)
        snapshotRef.current = null
        if (snapshot) h.onRestore(snapshot.libraryIds, snapshot.inPlayIds)
        announce(`Cancelled — ${labelFor(id)} is back where it started.`)
        return
      }

      if (lifted.kind === 'deck') {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          const index = inPlayIds.includes(id) ? inPlayIds.indexOf(id) : inPlayIds.length
          setLifted({ id, kind: 'chip' })
          h.onPlay(id, index)
          announce(`${labelFor(id)} is on the table at position ${index + 1}.`)
          return
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const from = libraryIds.indexOf(id)
          const to = from + (e.key === 'ArrowUp' ? -1 : 1)
          if (from === -1 || to < 0 || to >= libraryIds.length) return
          h.onReorderLibrary(moveItem(libraryIds, from, to))
          announce(`Moved ${labelFor(id)} to position ${to + 1} of ${libraryIds.length} in the library.`)
        }
        return
      }

      const at = inPlayIds.indexOf(id)
      if (at === -1) return

      // Up (or left off the front) is how a deck goes back to the library —
      // the reverse of the right-arrow that put it on the table.
      if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && at === 0)) {
        e.preventDefault()
        setLifted({ id, kind: 'deck' })
        h.onTakeOff(id)
        announce(`${labelFor(id)} is back in the library.`)
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const to = at + (e.key === 'ArrowLeft' ? -1 : 1)
        if (to < 0 || to >= inPlayIds.length) return
        h.onReorderPlay(moveItem(inPlayIds, at, to))
        announce(`Moved ${labelFor(id)} to position ${to + 1} of ${inPlayIds.length} on the table.`)
      }
    },
    [lifted, libraryIds, inPlayIds, announce, labelFor],
  )

  return {
    liftedId: lifted?.id ?? null,
    liftedKind: lifted?.kind ?? null,
    isLifted: (kind, id) => lifted?.kind === kind && lifted.id === id,
    handleKeyDown,
  }
}
