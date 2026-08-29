import type { DropOutcome } from '../decks/dnd/resolveDrop'

export interface GhostContent {
  title: string
  subtitle: string
  /** CSS colour for the stripe, matching the deck the drag came from. */
  hue: string
}

/**
 * The thing you are dragging, drawn under the pointer, with a badge naming
 * what letting go would do — `+18 cards`, `Already in Travel`, `Delete
 * deck`. The badge is the whole point: it turns a drag from "where will
 * this land?" into a statement of the outcome before you commit to it, and
 * it flips red the moment the target refuses.
 *
 * This component renders once per drag and then holds still: its position
 * comes from `elementRef`, which decks/dnd/useDeckDrag.ts writes straight to
 * the node every frame. Driving the transform through props instead would
 * re-render this whole screen sixty times a second to move one element.
 *
 * Positioned `fixed` with no transformed ancestor between the rail/table and
 * the viewport, so this needs no portal — if that ever changes it needs
 * `createPortal(..., document.body)`.
 */
export function DragGhost({
  visible,
  elementRef,
  size,
  content,
  outcome,
  rejecting,
}: {
  visible: boolean
  elementRef: (el: HTMLElement | null) => void
  size: { width: number; height: number } | null
  content: GhostContent
  outcome: DropOutcome | null
  rejecting: boolean
}) {
  if (!visible) return null

  const classes = ['ghost']
  if (rejecting) classes.push('ghost--reject')

  const badgeClasses = ['ghost__badge']
  if (outcome && !outcome.ok) badgeClasses.push('ghost__badge--no')
  if (outcome?.act === 'delete' || outcome?.act === 'remove') badgeClasses.push('ghost__badge--del')

  return (
    <div
      className={classes.join(' ')}
      ref={elementRef}
      aria-hidden="true"
      style={{
        ['--hue' as string]: content.hue,
        width: size ? `${size.width}px` : undefined,
        minHeight: size ? `${size.height}px` : undefined,
      }}
    >
      <div className="ghost__bar" />
      <div className="ghost__title">{content.title}</div>
      <div className="ghost__subtitle mono">{content.subtitle}</div>
      {outcome?.label && <div className={badgeClasses.join(' ')}>{outcome.label}</div>}
    </div>
  )
}
