import { useEffect, useRef, useState } from 'react'
import type { GhostFrame } from '../decks/dnd/dragPhysics'

const REFUSE_ANIMATION_MS = 220

/**
 * The tilt/lag drag image + outcome badge from issue #189's "Affordances"
 * spec — a rendering layer on top of useDragReorder/useDragGhost, not a new
 * interaction model. `position` comes from useDragGhost (already `null`
 * under reduced motion, so this renders nothing there — callers keep
 * today's plain opacity/outline treatment as the fallback).
 *
 * `refused` reflects whether the pointer is currently over *no* valid drop
 * target. When the drag ends while refused, the ghost is held briefly with
 * `.drag-ghost--refused` (a flip + spring-back keyframe) instead of
 * vanishing the instant `position` goes `null`, so the refusal reads as a
 * bounce rather than a disappearance.
 *
 * No transformed ancestor sits between the rail/table and the viewport, so
 * `position: fixed` positions correctly without a portal — if that ever
 * changes, this needs `createPortal(..., document.body)` instead.
 */
export function DragGhost({
  position,
  label,
  outcomeText,
  refused,
}: {
  position: GhostFrame | null
  label: string
  outcomeText: string
  refused: boolean
}) {
  const [display, setDisplay] = useState<{ pos: GhostFrame; refusing: boolean } | null>(null)
  const wasRefusedRef = useRef(refused)
  wasRefusedRef.current = refused

  useEffect(() => {
    if (position) {
      setDisplay({ pos: position, refusing: false })
      return
    }
    if (wasRefusedRef.current) {
      setDisplay((prev) => (prev ? { ...prev, refusing: true } : prev))
      const timeout = setTimeout(() => setDisplay(null), REFUSE_ANIMATION_MS)
      return () => clearTimeout(timeout)
    }
    setDisplay(null)
  }, [position])

  if (!display) return null

  const classes = ['drag-ghost']
  if (display.refusing) classes.push('drag-ghost--refused')

  return (
    <div
      className={classes.join(' ')}
      style={{ transform: `translate(${display.pos.x}px, ${display.pos.y}px) translate(-50%, -50%) rotate(${display.pos.angle}deg)` }}
    >
      <span className="drag-ghost__label">{label}</span>
      <span className="drag-ghost__badge">{outcomeText}</span>
    </div>
  )
}
