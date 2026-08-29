import { useEffect, useState } from 'react'
import { nextGhostFrame } from './dragPhysics'
import type { GhostFrame } from './dragPhysics'
import { prefersReducedMotion } from './prefersReducedMotion'

/**
 * Drives the drag-image ghost's position/tilt (issue #189's "Affordances"
 * spec) while `active`. Purely additive rendering state layered on top of
 * useDragReorder/useKeyboardReorder — it tracks the pointer with its own
 * `pointermove` listener (harmless alongside those hooks' own listeners;
 * multiple listeners per event type is normal DOM behavior) and runs an
 * rAF loop applying dragPhysics.nextGhostFrame.
 *
 * Returns `null` — no listener, no rAF loop — when the user prefers reduced
 * motion, so callers fall back to today's plain opacity/outline treatment.
 */
export function useDragGhost(active: boolean): { position: GhostFrame | null } {
  const [position, setPosition] = useState<GhostFrame | null>(null)

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setPosition(null)
      return
    }

    let frame: GhostFrame | null = null
    let target = { x: 0, y: 0 }
    let lastTime: number | null = null
    let rafId: number

    function handleMove(e: PointerEvent) {
      target = { x: e.clientX, y: e.clientY }
      if (!frame) frame = { x: e.clientX, y: e.clientY, angle: 0 }
    }

    function tick(time: number) {
      if (lastTime !== null && frame) {
        const dt = (time - lastTime) / 1000
        frame = nextGhostFrame(frame, target, dt)
        setPosition(frame)
      }
      lastTime = time
      rafId = requestAnimationFrame(tick)
    }

    document.addEventListener('pointermove', handleMove)
    rafId = requestAnimationFrame(tick)

    return () => {
      document.removeEventListener('pointermove', handleMove)
      cancelAnimationFrame(rafId)
    }
  }, [active])

  return { position }
}
