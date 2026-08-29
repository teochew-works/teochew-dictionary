import { describe, expect, it } from 'vitest'
import { insertionIndex, moveItem, pointInRect } from './geometry'
import type { Rect } from './geometry'

describe('pointInRect', () => {
  const rect: Rect = { top: 10, bottom: 20, left: 0, right: 100 }

  it('is true for a point inside the rect', () => {
    expect(pointInRect(50, 15, rect)).toBe(true)
  })

  it('is true exactly on the boundary', () => {
    expect(pointInRect(0, 10, rect)).toBe(true)
    expect(pointInRect(100, 20, rect)).toBe(true)
  })

  it('is false outside the rect', () => {
    expect(pointInRect(-1, 15, rect)).toBe(false)
    expect(pointInRect(50, 21, rect)).toBe(false)
  })
})

describe('insertionIndex', () => {
  it('returns 0 when the point is before every item (horizontal)', () => {
    const rects: Rect[] = [
      { top: 0, bottom: 10, left: 0, right: 10 },
      { top: 0, bottom: 10, left: 20, right: 30 },
    ]
    expect(insertionIndex(rects, { x: -5, y: 5 }, 'horizontal')).toBe(0)
  })

  it('returns the length when the point is past every item', () => {
    const rects: Rect[] = [
      { top: 0, bottom: 10, left: 0, right: 10 },
      { top: 0, bottom: 10, left: 20, right: 30 },
    ]
    expect(insertionIndex(rects, { x: 1000, y: 5 }, 'horizontal')).toBe(2)
  })

  it('returns the index of the item whose midpoint the point is before', () => {
    const rects: Rect[] = [
      { top: 0, bottom: 10, left: 0, right: 10 }, // mid x = 5
      { top: 0, bottom: 10, left: 20, right: 30 }, // mid x = 25
      { top: 0, bottom: 10, left: 40, right: 50 }, // mid x = 45
    ]
    expect(insertionIndex(rects, { x: 6, y: 5 }, 'horizontal')).toBe(1)
    expect(insertionIndex(rects, { x: 26, y: 5 }, 'horizontal')).toBe(2)
  })

  it('uses the y coordinate and top/bottom midpoint for the vertical axis', () => {
    const rects: Rect[] = [
      { top: 0, bottom: 10, left: 0, right: 100 }, // mid y = 5
      { top: 20, bottom: 30, left: 0, right: 100 }, // mid y = 25
    ]
    expect(insertionIndex(rects, { x: 50, y: 4 }, 'vertical')).toBe(0)
    expect(insertionIndex(rects, { x: 50, y: 26 }, 'vertical')).toBe(2)
  })

  it('returns 0 for an empty list', () => {
    expect(insertionIndex([], { x: 0, y: 0 }, 'horizontal')).toBe(0)
  })
})

describe('moveItem', () => {
  it('moves an item earlier', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 2, 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moves an item later', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('is a no-op when moved to its own index', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('returns the array unchanged for an out-of-range index', () => {
    const items = ['a', 'b', 'c']
    expect(moveItem(items, -1, 1)).toBe(items)
    expect(moveItem(items, 0, 3)).toBe(items)
  })
})
