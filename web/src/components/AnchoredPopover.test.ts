import { describe, expect, it } from 'vitest'
import { placeAnchored } from './AnchoredPopover'

const viewport = { innerWidth: 1000, innerHeight: 800 }
const panel = { width: 200, height: 120 }
const anchor = (top: number, left: number, width = 30, height = 20) => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
})

describe('placeAnchored', () => {
  it('hangs below the anchor, lined up with its left edge', () => {
    expect(placeAnchored(anchor(100, 300), panel, 'left', viewport)).toEqual({ left: 300, top: 125 })
  })

  it('lines up with the right edge when asked', () => {
    expect(placeAnchored(anchor(100, 300), panel, 'right', viewport)).toEqual({ left: 130, top: 125 })
  })

  it('flips above the anchor rather than running off the bottom', () => {
    // A menu on the last row of a list would otherwise be clipped or offscreen.
    expect(placeAnchored(anchor(700, 300), panel, 'left', viewport)).toEqual({ left: 300, top: 575 })
  })

  it('keeps a flipped panel on screen when there is no room either way', () => {
    // Too tall to sit below in a short window, and flipping would put it above
    // the top edge — it is clamped rather than pushed offscreen.
    const tight = { innerWidth: 1000, innerHeight: 200 }
    expect(placeAnchored(anchor(100, 300), panel, 'left', tight).top).toBe(8)
  })

  it('clamps against the right edge of the window', () => {
    expect(placeAnchored(anchor(100, 950), panel, 'left', viewport).left).toBe(792)
  })

  it('clamps against the left edge', () => {
    expect(placeAnchored(anchor(100, -40), panel, 'left', viewport).left).toBe(8)
  })

  it('stays on screen even when the anchor has been scrolled out of view', () => {
    // Neither placement is on screen on its own if the anchor is below the fold.
    const placed = placeAnchored(anchor(900, 300), panel, 'left', viewport)
    expect(placed.top).toBeGreaterThanOrEqual(8)
    expect(placed.top + panel.height).toBeLessThanOrEqual(viewport.innerHeight - 8)
  })

  it('prefers below when it fits exactly', () => {
    // bottom 100 + gap 5 + height 120 = 225, and the margin allows up to 225.
    expect(placeAnchored(anchor(80, 300), panel, 'left', { innerWidth: 1000, innerHeight: 233 }).top).toBe(105)
  })
})
