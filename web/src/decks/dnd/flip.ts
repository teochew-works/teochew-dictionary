import type { Rect } from './geometry'

export interface FlipDelta {
  dx: number
  dy: number
}

/**
 * Classic FLIP ("First, Last, Invert, Play") delta math for issue #189's
 * animated-reflow requirement: once a reorder/move lands and the DOM
 * shifts to the new order, items that moved should visually slide from
 * their old spot to the new one rather than snapping instantly. Kept pure
 * and DOM-free (mirrors geometry.ts's split) — decks/dnd/useFlip.ts applies
 * the result at the DOM boundary via `applyFlip`.
 */
export function computeFlipDeltas(before: Map<string, Rect>, after: Map<string, Rect>): Map<string, FlipDelta> {
  const deltas = new Map<string, FlipDelta>()
  for (const [id, beforeRect] of before) {
    const afterRect = after.get(id)
    if (!afterRect) continue
    const dx = beforeRect.left - afterRect.left
    const dy = beforeRect.top - afterRect.top
    if (dx !== 0 || dy !== 0) deltas.set(id, { dx, dy })
  }
  return deltas
}

/**
 * Instantly offsets `el` back to its pre-move position (the "Invert" step),
 * forces a layout, then clears the offset — the element's own CSS
 * transition (see `.deck-table__item`/`.deck-rail__row` in
 * FlashcardsView.css) carries it back to its natural position, producing
 * the slide. Not unit-tested — jsdom doesn't run layout, so this can only
 * be verified visually (see geometry.ts's header comment for why rect math
 * itself is instead tested with fabricated rects).
 */
export function applyFlip(el: HTMLElement, delta: FlipDelta): void {
  el.style.transition = 'none'
  el.style.transform = `translate(${delta.dx}px, ${delta.dy}px)`
  el.getBoundingClientRect() // force a layout so the transform above actually applies before it's cleared
  el.style.transition = ''
  el.style.transform = ''
}
