import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { moveItem } from './geometry'

export interface KeyboardReorder {
  isGrabbed: (id: string) => boolean
  handleKeyDown: (id: string, e: ReactKeyboardEvent) => void
}

/**
 * The accessible drag-and-drop keyboard pattern (issue #187): Space/Enter
 * lifts an item, arrow keys move it within the list, Space/Enter again
 * drops it, Escape reverts to the order at lift time. Every step is
 * announced via `announce` (a shared aria-live region — see LiveRegion).
 *
 * Only one item across the whole app is ever grabbed at a time (grabbing a
 * second item isn't wired up anywhere, but the state is deliberately not
 * scoped per-list in case a future zone-crossing gesture needs to know that).
 *
 * `crossListTarget` (issue #189) is that zone-crossing gesture: while an
 * item is grabbed, a dedicated key (default `t`) moves it to a different
 * list entirely, since arrow keys already mean "reorder within this list"
 * and there's no standard convention for "move to a different drop zone" —
 * a distinct key, announced when the item is picked up, is this hook's
 * answer to that gap. Unlike a pointer drop, a keyboard move has no pointer
 * position to compute an insertion index from, so it always lands at the
 * end of the target list (`crossListTarget.onMove` takes no index).
 */
export function useKeyboardReorder(
  ids: string[],
  onReorder: (ids: string[]) => void,
  announce: (message: string) => void,
  labelFor: (id: string) => string,
  crossListTarget?: {
    /** Human-readable name of the target list, used in announce() messages — e.g. 'the table'. */
    zoneLabel: string
    /** The key (case-insensitive) that moves the grabbed item to the target list. Defaults to 't'. */
    moveKey?: string
    onMove: (id: string) => void
  },
): KeyboardReorder {
  const [grabbedId, setGrabbedId] = useState<string | null>(null)
  const liftedOrderRef = useRef<string[] | null>(null)

  const handleKeyDown = useCallback(
    (id: string, e: ReactKeyboardEvent) => {
      const index = ids.indexOf(id)
      if (index === -1) return

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (grabbedId === id) {
          setGrabbedId(null)
          liftedOrderRef.current = null
          announce(`Dropped ${labelFor(id)} at position ${index + 1} of ${ids.length}.`)
        } else {
          setGrabbedId(id)
          liftedOrderRef.current = ids
          const hint = crossListTarget
            ? `Use arrow keys to move, space to drop, ${crossListTarget.moveKey ?? 't'} to move to ${crossListTarget.zoneLabel}, escape to cancel.`
            : 'Use arrow keys to move, space to drop, escape to cancel.'
          announce(`Picked up ${labelFor(id)}. ${hint}`)
        }
        return
      }

      if (grabbedId !== id) return

      if (crossListTarget && e.key.toLowerCase() === (crossListTarget.moveKey ?? 't').toLowerCase()) {
        e.preventDefault()
        setGrabbedId(null)
        liftedOrderRef.current = null
        crossListTarget.onMove(id)
        announce(`Moved ${labelFor(id)} to ${crossListTarget.zoneLabel}.`)
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        const original = liftedOrderRef.current
        setGrabbedId(null)
        liftedOrderRef.current = null
        if (original) onReorder(original)
        announce(`Cancelled — ${labelFor(id)} is back where it started.`)
        return
      }

      const isBackward = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      const isForward = e.key === 'ArrowRight' || e.key === 'ArrowDown'
      if (!isBackward && !isForward) return

      e.preventDefault()
      const target = isBackward ? index - 1 : index + 1
      if (target < 0 || target >= ids.length) return

      onReorder(moveItem(ids, index, target))
      announce(`Moved ${labelFor(id)} to position ${target + 1} of ${ids.length}.`)
    },
    [ids, grabbedId, onReorder, announce, labelFor, crossListTarget],
  )

  return { isGrabbed: (id: string) => grabbedId === id, handleKeyDown }
}
