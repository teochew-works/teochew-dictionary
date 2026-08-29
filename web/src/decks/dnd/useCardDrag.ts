import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { pointInRect } from './geometry'
import type { Rect } from './geometry'

export interface CardDropTarget {
  id: string
  isVirtual: boolean
}

export interface CardDrag {
  isDragging: boolean
  /** The target currently under the pointer, or null — drives per-row hover styling. */
  overId: string | null
  targetRef: (id: string) => (el: HTMLElement | null) => void
  onPointerDown: (e: ReactPointerEvent) => void
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

/**
 * Drag-and-drop for filing the current flashcard into a deck (issue #187
 * stage 4): pick up the card, drop it on a deck row. `targets` are
 * registered by id via `targetRef`, independent of which list renders them
 * (in practice, the library rail's rows). Dropping on a virtual deck (the
 * dictionary) calls `onRefused` instead of `onFile` — the read-only deck
 * still reacts to the drop, it just doesn't accept it.
 */
export function useCardDrag({
  targets,
  onFile,
  onRefused,
}: {
  targets: CardDropTarget[]
  onFile: (deckId: string) => void
  onRefused: (deckId: string) => void
}): CardDrag {
  const [isDragging, setIsDragging] = useState(false)
  const [overId, setOverId] = useState<string | null>(null)
  const targetElsRef = useRef<Map<string, HTMLElement>>(new Map())
  const targetsRef = useRef(targets)
  targetsRef.current = targets

  const targetRef = useCallback(
    (id: string) =>
      (el: HTMLElement | null) => {
        if (el) targetElsRef.current.set(id, el)
        else targetElsRef.current.delete(id)
      },
    [],
  )

  const targetAtPoint = useCallback((x: number, y: number): string | null => {
    for (const [id, el] of targetElsRef.current) {
      if (pointInRect(x, y, rectOf(el))) return id
    }
    return null
  }, [])

  useEffect(() => {
    if (!isDragging) return

    function handleMove(e: PointerEvent) {
      setOverId(targetAtPoint(e.clientX, e.clientY))
    }

    function handleUp(e: PointerEvent) {
      setIsDragging(false)
      setOverId(null)
      const id = targetAtPoint(e.clientX, e.clientY)
      if (!id) return
      const target = targetsRef.current.find((t) => t.id === id)
      if (!target) return
      if (target.isVirtual) onRefused(id)
      else onFile(id)
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
    }
  }, [isDragging, targetAtPoint, onFile, onRefused])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
  }, [])

  return { isDragging, overId, targetRef, onPointerDown }
}
