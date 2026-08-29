import { useEffect, useId, useRef, useState } from 'react'

/**
 * A small, non-modal delete confirmation (issue #189), replacing
 * `window.confirm` for deck (and group) deletion. Modeled directly on
 * FiltersPopover.tsx's shape — an anchored disclosure, not a modal dialog
 * (`role="group"`, not `role="dialog"`): this is the app's first
 * delete-confirmation need, and a small dedicated component covers it
 * without introducing a general-purpose modal-dialog subsystem.
 */
export function DeleteConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

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
    <div className="delete-confirm">
      <button
        type="button"
        ref={triggerRef}
        className="delete-confirm__trigger"
        aria-label={`Delete ${label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        Delete
      </button>
      {open && (
        <div id={panelId} className="delete-confirm__panel" role="group" aria-label={`Confirm delete ${label}`} ref={panelRef}>
          <p className="delete-confirm__text">Delete "{label}"? This can't be undone.</p>
          <button
            type="button"
            className="delete-confirm__confirm"
            aria-label={`Confirm deleting ${label}`}
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            Delete
          </button>
          <button type="button" className="delete-confirm__cancel" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
