import type { GhostFrame } from '../decks/dnd/dragPhysics'
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
 * The tilt comes from the image trailing the pointer (see
 * decks/dnd/dragPhysics.ts). Under reduced motion the image is pinned
 * exactly to the pointer and the tilt stays at zero — the badge and the
 * image are affordances, so they stay; only the motion goes.
 *
 * Positioned `fixed` with no transformed ancestor between the rail/table
 * and the viewport, so this needs no portal — if that ever changes it needs
 * `createPortal(..., document.body)`.
 */
export function DragGhost({
  frame,
  size,
  content,
  outcome,
  rejecting,
}: {
  frame: GhostFrame | null
  size: { width: number; height: number } | null
  content: GhostContent
  outcome: DropOutcome | null
  rejecting: boolean
}) {
  if (!frame) return null

  const classes = ['ghost']
  if (rejecting) classes.push('ghost--reject')

  const badgeClasses = ['ghost__badge']
  if (outcome && !outcome.ok) badgeClasses.push('ghost__badge--no')
  if (outcome?.act === 'delete') badgeClasses.push('ghost__badge--del')

  return (
    <div
      className={classes.join(' ')}
      aria-hidden="true"
      style={{
        ['--hue' as string]: content.hue,
        width: size ? `${size.width}px` : undefined,
        minHeight: size ? `${size.height}px` : undefined,
        transform: `translate3d(${frame.x.toFixed(1)}px, ${frame.y.toFixed(1)}px, 0) rotate(${frame.angle.toFixed(2)}deg) scale(1.045)`,
      }}
    >
      <div className="ghost__bar" />
      <div className="ghost__title">{content.title}</div>
      <div className="ghost__subtitle mono">{content.subtitle}</div>
      {outcome?.label && <div className={badgeClasses.join(' ')}>{outcome.label}</div>}
    </div>
  )
}
