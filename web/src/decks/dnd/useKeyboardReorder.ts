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
 * Reordering is same-list only — moving an item to a different list (e.g.
 * the table) goes through its own explicit control instead, since there's
 * no standard keyboard convention for "move to a different drop zone".
 */
export function useKeyboardReorder(
  ids: string[],
  onReorder: (ids: string[]) => void,
  announce: (message: string) => void,
  labelFor: (id: string) => string,
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
          announce(`Picked up ${labelFor(id)}. Use arrow keys to move, space to drop, escape to cancel.`)
        }
        return
      }

      if (grabbedId !== id) return

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
    [ids, grabbedId, onReorder, announce, labelFor],
  )

  return { isGrabbed: (id: string) => grabbedId === id, handleKeyDown }
}
