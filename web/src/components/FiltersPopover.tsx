import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Everything besides prompt side (issue #187 stage 2) lives behind this
 * disclosure rather than as a permanent stack of controls — see
 * FlashcardsView's file header. Closes on Escape or an outside click;
 * content is unmounted while closed rather than hidden, so closed-state
 * markup never has to be excluded by hand in tests.
 */
export function FiltersPopover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  return (
    <div className="filters-popover">
      <button
        type="button"
        ref={triggerRef}
        className="filters-popover__trigger"
        aria-expanded={open}
        aria-controls="flashcards-filters-panel"
        onClick={() => setOpen((v) => !v)}
      >
        Filters
      </button>
      {open && (
        <div
          id="flashcards-filters-panel"
          className="filters-popover__panel"
          role="group"
          aria-label="Filters"
          ref={panelRef}
        >
          {children}
        </div>
      )}
    </div>
  )
}
