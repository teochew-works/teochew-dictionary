import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { insertionIndex, pointInRect } from './geometry'
import type { Rect } from './geometry'

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

export interface DragReorder {
  isDragging: (id: string) => boolean
  /** False once the pointer has left the container during an active drag — drives a "this will be removed" visual cue. */
  isOverContainer: boolean
  containerRef: (el: HTMLElement | null) => void
  itemRef: (id: string) => (el: HTMLElement | null) => void
  onPointerDown: (id: string) => (e: ReactPointerEvent) => void
}

/**
 * Pointer-based drag-and-drop for a single reorderable list (issue #187):
 * pick up an item, move it over siblings, and drop to reorder — or drop
 * outside the container to remove it (only if `onDropOutside` is given).
 *
 * Deliberately hand-rolled rather than the HTML5 drag-and-drop API or a
 * library, matching this repo's existing preference for small hand-written
 * implementations over dependencies (see the rationale comment at the top
 * of srs/scheduler.ts) — the native API can't give a refusal state and
 * behaves inconsistently on touch.
 *
 * The final position is computed once, on drop, from real element rects —
 * there's no live reflow-as-you-drag preview, which keeps this simple and
 * avoids writing to the store on every pointer-move.
 */
export function useDragReorder({
  ids,
  onReorder,
  onDropOutside,
  announce,
  labelFor,
  axis = 'horizontal',
}: {
  ids: string[]
  onReorder: (ids: string[]) => void
  onDropOutside?: (id: string) => void
  announce: (message: string) => void
  labelFor: (id: string) => string
  axis?: 'horizontal' | 'vertical'
}): DragReorder {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [isOverContainer, setIsOverContainer] = useState(true)
  const containerElRef = useRef<HTMLElement | null>(null)
  const itemElsRef = useRef<Map<string, HTMLElement>>(new Map())
  const idsRef = useRef(ids)
  idsRef.current = ids

  const containerRef = useCallback((el: HTMLElement | null) => {
    containerElRef.current = el
  }, [])

  const itemRef = useCallback(
    (id: string) =>
      (el: HTMLElement | null) => {
        if (el) itemElsRef.current.set(id, el)
        else itemElsRef.current.delete(id)
      },
    [],
  )

  useEffect(() => {
    if (!draggingId) return

    function handleMove(e: PointerEvent) {
      const container = containerElRef.current
      setIsOverContainer(container ? pointInRect(e.clientX, e.clientY, rectOf(container)) : false)
    }

    function handleUp(e: PointerEvent) {
      const id = draggingId
      setDraggingId(null)
      if (!id) return

      const container = containerElRef.current
      const currentIds = idsRef.current
      const over = container ? pointInRect(e.clientX, e.clientY, rectOf(container)) : false

      if (!over) {
        onDropOutside?.(id)
        if (onDropOutside) announce(`Removed ${labelFor(id)}.`)
        return
      }

      const withoutDragged = currentIds.filter((otherId) => otherId !== id)
      const otherRects = withoutDragged
        .map((otherId) => itemElsRef.current.get(otherId))
        .filter((el): el is HTMLElement => el != null)
        .map(rectOf)
      const toIndex = insertionIndex(otherRects, { x: e.clientX, y: e.clientY }, axis)
      const reordered = [...withoutDragged.slice(0, toIndex), id, ...withoutDragged.slice(toIndex)]

      if (JSON.stringify(reordered) !== JSON.stringify(currentIds)) {
        onReorder(reordered)
        announce(`Moved ${labelFor(id)} to position ${reordered.indexOf(id) + 1} of ${reordered.length}.`)
      }
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
  }, [draggingId, onReorder, onDropOutside, announce, labelFor, axis])

  const onPointerDown = useCallback(
    (id: string) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      setDraggingId(id)
      setIsOverContainer(true)
    },
    [],
  )

  return {
    isDragging: (id: string) => draggingId === id,
    isOverContainer,
    containerRef,
    itemRef,
    onPointerDown,
  }
}
