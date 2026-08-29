/**
 * Pure geometry helpers for pointer-based drag-and-drop, kept free of DOM
 * APIs so they're unit-testable with fabricated rects — jsdom's
 * getBoundingClientRect always reports all-zero rects (it doesn't run
 * layout), so real coordinate math can only be verified this way in tests.
 * Callers (useDragReorder.ts) supply real rects at the DOM boundary.
 */
export interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/**
 * Where a point falls among `itemRects` (in current display order): the
 * index of the first item whose midpoint (along `axis`) is past the point,
 * or `itemRects.length` if the point is past every item.
 */
export function insertionIndex(itemRects: Rect[], point: { x: number; y: number }, axis: 'horizontal' | 'vertical'): number {
  for (let i = 0; i < itemRects.length; i += 1) {
    const rect = itemRects[i]!
    const mid = axis === 'horizontal' ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2
    const coord = axis === 'horizontal' ? point.x : point.y
    if (coord < mid) return i
  }
  return itemRects.length
}

/** Moves the item at `fromIndex` to `toIndex` (both indices into the pre-move array). Out-of-range indices return `items` unchanged. */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return items
  const result = [...items]
  const removed = result.splice(fromIndex, 1)
  const moved = removed[0] as T
  result.splice(toIndex, 0, moved)
  return result
}
