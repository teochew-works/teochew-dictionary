import { useCallback, useRef } from 'react'
type ItemRef = (el: HTMLElement | null) => void

/**
 * Composes the several per-deck element refs a card needs — drag source,
 * FLIP measurement, card drop target — into one, cached per deck id.
 *
 * Without the cache each render hands React a brand-new ref function for
 * every deck, so React detaches and re-attaches every element: real DOM work
 * on the path a drag re-renders. The factories are read through a ref so the
 * composed function itself never has to change.
 */
export function useComposedItemRef(...factories: ((id: string) => ItemRef)[]): (id: string) => ItemRef {
  const cache = useRef(new Map<string, ItemRef>())
  const factoriesRef = useRef(factories)
  factoriesRef.current = factories

  return useCallback((id: string) => {
    let composed = cache.current.get(id)
    if (!composed) {
      composed = (el) => {
        for (const factory of factoriesRef.current) factory(id)(el)
      }
      cache.current.set(id, composed)
    }
    return composed
  }, [])
}

