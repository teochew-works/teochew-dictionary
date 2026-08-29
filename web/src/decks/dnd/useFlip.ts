import { useCallback, useLayoutEffect, useRef } from 'react'
import { applyFlip, computeFlipDeltas } from './flip'
import type { Rect } from './geometry'
import { prefersReducedMotion } from './prefersReducedMotion'

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

/**
 * Wires flip.ts's FLIP math to a reorderable list's actual DOM elements:
 * whenever `ids` changes (a reorder or a rail-to-table move lands), items
 * that shifted position slide from their old spot to the new one instead
 * of snapping — see flip.ts's header comment. Skipped under reduced motion
 * (items just land in place, matching the existing opacity/outline
 * fallback's behavior).
 */
export function useFlip(ids: string[]): { itemRef: (id: string) => (el: HTMLElement | null) => void } {
  const itemElsRef = useRef(new Map<string, HTMLElement>())
  const prevRectsRef = useRef(new Map<string, Rect>())

  const itemRef = useCallback(
    (id: string) =>
      (el: HTMLElement | null) => {
        if (el) itemElsRef.current.set(id, el)
        else itemElsRef.current.delete(id)
      },
    [],
  )

  useLayoutEffect(() => {
    const afterRects = new Map<string, Rect>()
    itemElsRef.current.forEach((el, id) => afterRects.set(id, rectOf(el)))

    if (!prefersReducedMotion()) {
      const deltas = computeFlipDeltas(prevRectsRef.current, afterRects)
      deltas.forEach((delta, id) => {
        const el = itemElsRef.current.get(id)
        if (el) applyFlip(el, delta)
      })
    }

    prevRectsRef.current = afterRects
  }, [ids.join(',')])

  return { itemRef }
}
