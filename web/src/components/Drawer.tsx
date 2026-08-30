import type { ReactNode } from 'react'

/**
 * The dock along the bottom of the flashcards screen. One element, whose body
 * swaps between the dictionary and a deck's contents — rendering the two
 * bodies as sibling components would unmount and remount this `<section>`,
 * restarting the `max-height` transition so the dock visibly collapses and
 * reopens on every switch.
 *
 * `inert` rather than `aria-hidden`: the dock stays mounted when closed (that
 * is what animates it), so its search field, buttons, and entry rows remain
 * focusable. Marking it hidden while leaving it tabbable is a WCAG failure;
 * `inert` takes it out of the tab order and the accessibility tree together.
 */
export function Drawer({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean
  label: string
  /** Phone width only (CSS) — the dock becomes a bottom sheet there, and this
      renders a drag-handle-shaped close button across its top edge so it can
      be dismissed without reaching back up to whatever opened it
      (mobile.md §3.4). Omit where a caller has no such affordance to offer. */
  onClose?: () => void
  children: ReactNode
}) {
  return (
    <section className={open ? 'drawer drawer--open' : 'drawer'} aria-label={label} inert={!open}>
      {onClose && (
        <button type="button" className="drawer__handle" onClick={onClose} aria-label={`Close ${label}`}>
          <span className="drawer__handle-bar" aria-hidden="true" />
        </button>
      )}
      {children}
    </section>
  )
}
