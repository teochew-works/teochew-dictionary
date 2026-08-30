import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Closes an open disclosure on Escape or a pointer press outside it — the
 * behaviour every popover on this screen (filters, deck menu, file-into
 * menu) needs identically. Factored out rather than copied a third time.
 *
 * Listens on `pointerdown` rather than `click` so a press that starts inside
 * the panel and releases outside (a drag from within it) doesn't count as
 * an outside click. `pointerdown` (rather than `mousedown`) covers touch too
 * — iOS Safari doesn't reliably synthesise `mousedown` for taps on
 * non-interactive elements (mobile.md §2.2).
 */
export function useDismissOnOutside(
  open: boolean,
  onClose: () => void,
  refs: RefObject<HTMLElement | null>[],
): void {
  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, ...refs])
}
