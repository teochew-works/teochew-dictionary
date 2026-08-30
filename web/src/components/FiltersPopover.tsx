import { useRef } from 'react'
import type { ReactNode } from 'react'
import { AnchoredPopover } from './AnchoredPopover'
import { useDismissOnOutside } from './useDismissOnOutside'

/**
 * Everything except prompt side lives behind this one disclosure rather
 * than as a permanent stack of controls above the card — the view it
 * replaced stacked a select, two checkboxes, and a seven-box level
 * fieldset between the reader and the thing they came to read.
 *
 * Open state is owned by the caller so the funnel readout can open it by
 * naming the stage that cut the pool. Content is unmounted while closed
 * rather than hidden, so closed-state markup never has to be excluded by
 * hand in tests.
 */
export function FiltersPopover({
  open,
  onOpenChange,
  activeCount,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Non-default filters currently applied — shown as a badge on the trigger. */
  activeCount: number
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useDismissOnOutside(open, () => onOpenChange(false), [panelRef, triggerRef])

  return (
    <div className="filters-popover">
      <button
        type="button"
        ref={triggerRef}
        className={activeCount > 0 ? 'pill pill--on' : 'pill'}
        aria-expanded={open}
        aria-controls="flashcards-filters-panel"
        onClick={() => onOpenChange(!open)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1 2.2h10L7.2 6.6v3.6L4.8 11V6.6L1 2.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="pill__n" aria-label={`${activeCount} active`}>
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          id="flashcards-filters-panel"
          className="pop filters-popover__panel"
          role="group"
          aria-label="Filters"
        >
          <div ref={panelRef} className="pop__items">
            {children}
          </div>
        </AnchoredPopover>
      )}
    </div>
  )
}
