import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { insertionIndex, pointInRect } from './geometry'
import type { Rect } from './geometry'

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

/** Lets another list's `useDragReorder` treat this one as a valid cross-list drop target — see `crossListTarget` below. */
export interface DropZoneHandle {
  containerRect: () => Rect | null
  items: () => { id: string; rect: Rect }[]
}

export interface DragReorder {
  isDragging: (id: string) => boolean
  /** False once the pointer has left the container during an active drag — drives a "this will be removed" visual cue. */
  isOverContainer: boolean
  containerRef: (el: HTMLElement | null) => void
  itemRef: (id: string) => (el: HTMLElement | null) => void
  onPointerDown: (id: string) => (e: ReactPointerEvent) => void
  /** A stable handle another list can pass as its own `crossListTarget.dropZone` to accept drops from that list. */
  dropZone: DropZoneHandle
  /** Where the dragged item would land if dropped now, within this list — `null` when not dragging or not over this container. Drives the insertion caret. */
  previewIndex: number | null
  /** Where the dragged item would land in `crossListTarget`'s list if dropped now — `null` when not dragging over it. Lets the target list render its own caret via a callback prop, since it's a different component/hook instance. */
  crossListPreviewIndex: number | null
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
 *
 * `crossListTarget` (issue #189) extends this to a second valid drop
 * location owned by a *different* `useDragReorder` instance (e.g. the
 * library rail dropping onto the table): dropping there is checked before
 * falling through to `onDropOutside`, using that list's own `dropZone`
 * handle to read its live rects without either hook reaching into the
 * other's internals.
 */
export function useDragReorder({
  ids,
  onReorder,
  onDropOutside,
  announce,
  labelFor,
  axis = 'horizontal',
  crossListTarget,
}: {
  ids: string[]
  onReorder: (ids: string[]) => void
  onDropOutside?: (id: string) => void
  announce: (message: string) => void
  labelFor: (id: string) => string
  axis?: 'horizontal' | 'vertical'
  crossListTarget?: {
    dropZone: DropZoneHandle
    /** The TARGET list's axis, not this hook's own — e.g. the table is horizontal even when the rail (this hook) is vertical. */
    axis: 'horizontal' | 'vertical'
    /** Human-readable name of the target list, used in the announce() message — e.g. 'the table'. */
    zoneLabel: string
    onDrop: (id: string, index: number) => void
  }
}): DragReorder {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [isOverContainer, setIsOverContainer] = useState(true)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [crossListPreviewIndex, setCrossListPreviewIndex] = useState<number | null>(null)
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

  const dropZoneRef = useRef<DropZoneHandle>({
    containerRect: () => (containerElRef.current ? rectOf(containerElRef.current) : null),
    items: () =>
      idsRef.current.flatMap((id) => {
        const el = itemElsRef.current.get(id)
        return el ? [{ id, rect: rectOf(el) }] : []
      }),
  })

  useEffect(() => {
    if (!draggingId) return

    function handleMove(e: PointerEvent) {
      const container = containerElRef.current
      const overContainer = container ? pointInRect(e.clientX, e.clientY, rectOf(container)) : false
      setIsOverContainer(overContainer)

      if (overContainer) {
        const withoutDragged = idsRef.current.filter((otherId) => otherId !== draggingId)
        const otherRects = withoutDragged
          .map((otherId) => itemElsRef.current.get(otherId))
          .filter((el): el is HTMLElement => el != null)
          .map(rectOf)
        setPreviewIndex(insertionIndex(otherRects, { x: e.clientX, y: e.clientY }, axis))
      } else {
        setPreviewIndex(null)
      }

      if (crossListTarget) {
        const targetRect = crossListTarget.dropZone.containerRect()
        const overTarget = targetRect ? pointInRect(e.clientX, e.clientY, targetRect) : false
        if (overTarget) {
          const otherItems = crossListTarget.dropZone.items().filter((item) => item.id !== draggingId)
          setCrossListPreviewIndex(insertionIndex(otherItems.map((item) => item.rect), { x: e.clientX, y: e.clientY }, crossListTarget.axis))
        } else {
          setCrossListPreviewIndex(null)
        }
      }
    }

    function handleUp(e: PointerEvent) {
      const id = draggingId
      setDraggingId(null)
      setPreviewIndex(null)
      setCrossListPreviewIndex(null)
      if (!id) return

      const container = containerElRef.current
      const currentIds = idsRef.current
      const over = container ? pointInRect(e.clientX, e.clientY, rectOf(container)) : false

      if (!over) {
        if (crossListTarget) {
          const targetRect = crossListTarget.dropZone.containerRect()
          if (targetRect && pointInRect(e.clientX, e.clientY, targetRect)) {
            const otherItems = crossListTarget.dropZone.items().filter((item) => item.id !== id)
            const index = insertionIndex(otherItems.map((item) => item.rect), { x: e.clientX, y: e.clientY }, crossListTarget.axis)
            crossListTarget.onDrop(id, index)
            announce(`Moved ${labelFor(id)} to ${crossListTarget.zoneLabel} at position ${index + 1}.`)
            return
          }
        }
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
  }, [draggingId, onReorder, onDropOutside, announce, labelFor, axis, crossListTarget])

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
    dropZone: dropZoneRef.current,
    previewIndex,
    crossListPreviewIndex,
  }
}
