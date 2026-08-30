import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'

/** Breathing room between the panel and its anchor, and between the panel and the viewport edge. */
const GAP = 5
const MARGIN = 8

export interface AnchoredPosition {
  left: number
  top: number
}

/**
 * A panel hung off a trigger, rendered into `document.body` rather than
 * beside it.
 *
 * Every popover on this screen opens from inside something that would
 * otherwise swallow it. A deck's row sets `opacity` while it is on the table,
 * and opacity below 1 creates a stacking context — so a menu inside it could
 * not paint above the deck rows *after* it however high its z-index went, and
 * inherited the row's translucency into the bargain. The rail, the drawer's
 * list, and the main column all scroll, so a panel near the bottom of any of
 * them was clipped. A portal escapes all of it, which is why this positions
 * itself from the anchor's rect instead of relying on containment.
 *
 * It flips above the anchor rather than running off the bottom of the window,
 * and is clamped horizontally, so a menu on the last row of a list is still
 * fully readable.
 */
export function AnchoredPopover({
  anchorRef,
  align = 'left',
  className,
  children,
  ...panelProps
}: {
  anchorRef: RefObject<HTMLElement | null>
  /** Which edge of the anchor to line the panel up with. */
  align?: 'left' | 'right'
  className: string
  children: ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<AnchoredPosition | null>(null)

  useLayoutEffect(() => {
    function place() {
      const panel = panelRef.current
      if (!panel) return
      // A missing anchor still gets a placement rather than staying hidden:
      // an unplaceable menu should be awkward, not invisible.
      const anchor = anchorRef.current?.getBoundingClientRect() ?? { top: 0, bottom: 0, left: 0, right: 0 }
      setPosition(placeAnchored(anchor, panel.getBoundingClientRect(), align, window))
    }

    place()
    window.addEventListener('resize', place)
    // Capture, so scrolling any container between the anchor and the window
    // keeps the panel on its trigger rather than stranding it.
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef, align])

  return createPortal(
    <div
      {...panelProps}
      ref={panelRef}
      className={className}
      style={{
        position: 'fixed',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        // Hidden only for the frame before it has been placed, so it is never
        // seen in the wrong spot on the way to the right one.
        visibility: position ? undefined : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

/**
 * Where the panel goes: under the anchor by default, above it when there is no
 * room below, and always inside the viewport. Pure, so the arithmetic is
 * testable without a layout engine — jsdom has none.
 */
export function placeAnchored(
  anchor: { top: number; bottom: number; left: number; right: number },
  panel: { width: number; height: number },
  align: 'left' | 'right',
  viewport: { innerWidth: number; innerHeight: number },
): AnchoredPosition {
  const preferred = align === 'right' ? anchor.right - panel.width : anchor.left
  const left = Math.max(MARGIN, Math.min(preferred, viewport.innerWidth - panel.width - MARGIN))

  const below = anchor.bottom + GAP
  const fitsBelow = below + panel.height <= viewport.innerHeight - MARGIN
  const preferredTop = fitsBelow ? below : anchor.top - panel.height - GAP
  // Clamped at the end as well, because an anchor can be scrolled out of view
  // entirely — in which case neither placement is on screen on its own.
  const top = Math.max(MARGIN, Math.min(preferredTop, viewport.innerHeight - panel.height - MARGIN))

  return { left, top }
}
