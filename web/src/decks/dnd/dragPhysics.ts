/**
 * Pure math for the drag-image ghost (issue #189's "Affordances" spec: a
 * tilt/lag drag image, decaying back to level once the pointer settles).
 * Kept DOM-free so it's unit-testable without rAF/pointer mocking, mirroring
 * geometry.ts's pure/DOM split — decks/dnd/useDragGhost.ts supplies real
 * pointer positions and timestamps at the DOM boundary.
 */
export interface GhostFrame {
  x: number
  y: number
  angle: number
}

/** How much of the remaining distance to the pointer is closed per second — higher trails less. */
const CATCH_UP_RATE = 18
/** Degrees of tilt per px/s of horizontal velocity, clamped to MAX_TILT_DEG. */
const TILT_PER_VELOCITY = 0.012
const MAX_TILT_DEG = 18

/**
 * Advances `current` one frame toward `target` (the live pointer position),
 * `dt` seconds later. Lag comes from exponential easing rather than
 * following the pointer exactly; tilt comes from the resulting frame's
 * instantaneous horizontal velocity, so it naturally decays to 0 as the
 * ghost catches up and settles.
 */
export function nextGhostFrame(current: GhostFrame, target: { x: number; y: number }, dt: number): GhostFrame {
  if (dt <= 0) return current

  const catchUp = 1 - Math.exp(-CATCH_UP_RATE * dt)
  const x = current.x + (target.x - current.x) * catchUp
  const y = current.y + (target.y - current.y) * catchUp

  const velocityX = (x - current.x) / dt
  const angle = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, velocityX * TILT_PER_VELOCITY))

  return { x, y, angle }
}
