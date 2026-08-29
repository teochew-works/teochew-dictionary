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
export function Drawer({ open, label, children }: { open: boolean; label: string; children: ReactNode }) {
  return (
    <section className={open ? 'drawer drawer--open' : 'drawer'} aria-label={label} inert={!open}>
      {children}
    </section>
  )
}
