/**
 * Pure math for the drag image: it eases toward the pointer rather than
 * tracking it exactly, and the distance it is still behind by is what tilts
 * it — so the tilt builds as the drag accelerates and decays to level the
 * moment the pointer settles.
 *
 * Kept DOM-free so it's unit-testable without rAF or pointer mocking,
 * mirroring geometry.ts's pure/DOM split — decks/dnd/useDeckDrag.ts supplies
 * real pointer positions and frame timestamps at the DOM boundary.
 */
export interface GhostFrame {
  x: number
  y: number
  angle: number
}

/** Fraction of the remaining distance closed per second, as an exponential rate — higher trails less. */
const CATCH_UP_RATE = 18
/** Degrees of tilt per pixel still behind the pointer. */
const TILT_PER_PX = 0.25
const MAX_TILT_DEG = 9

/**
 * Advances `current` one frame toward `target` (the live pointer position,
 * less the grab offset), `dt` seconds later. Easing is exponential so the
 * result is frame-rate independent: the same gesture tilts the same amount
 * at 60Hz and at 120Hz.
 */
export function nextGhostFrame(current: GhostFrame, target: { x: number; y: number }, dt: number): GhostFrame {
  if (dt <= 0) return current

  const catchUp = 1 - Math.exp(-CATCH_UP_RATE * dt)
  const x = current.x + (target.x - current.x) * catchUp
  const y = current.y + (target.y - current.y) * catchUp

  const lag = target.x - x
  const angle = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, lag * TILT_PER_PX))

  return { x, y, angle }
}
