import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useDragReorder } from './useDragReorder'

const labelFor = (id: string) => ({ a: 'A', b: 'B', c: 'C' })[id] ?? id

function mockRect(el: HTMLElement, rect: { top: number; bottom: number; left: number; right: number }) {
  el.getBoundingClientRect = () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top, x: rect.left, y: rect.top, toJSON: () => ({}) })
}

function pointerDown() {
  return { button: 0 } as unknown as ReactPointerEvent
}

function dispatchPointerUp(x: number, y: number) {
  document.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y }))
}

function dispatchPointerMove(x: number, y: number) {
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }))
}

describe('useDragReorder', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is not dragging initially and reports over the container by default', () => {
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder: vi.fn(), announce: vi.fn(), labelFor }))
    expect(result.current.isDragging('a')).toBe(false)
    expect(result.current.isOverContainer).toBe(true)
  })

  it('marks an item as dragging once picked up', () => {
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder: vi.fn(), announce: vi.fn(), labelFor }))

    act(() => result.current.onPointerDown('a')(pointerDown()))

    expect(result.current.isDragging('a')).toBe(true)
    expect(result.current.isDragging('b')).toBe(false)
  })

  it('ignores a non-primary-button pointerdown', () => {
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder: vi.fn(), announce: vi.fn(), labelFor }))

    act(() => result.current.onPointerDown('a')({ button: 2 } as unknown as ReactPointerEvent))

    expect(result.current.isDragging('a')).toBe(false)
  })

  it('reorders past a sibling dropped to its right (horizontal)', () => {
    const onReorder = vi.fn()
    const announce = vi.fn()
    const { result } = renderHook(() =>
      useDragReorder({ ids: ['a', 'b', 'c'], onReorder, announce, labelFor, axis: 'horizontal' }),
    )

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 300 })
    act(() => result.current.containerRef(container))

    const bEl = document.createElement('div')
    mockRect(bEl, { top: 0, bottom: 50, left: 100, right: 200 }) // mid x = 150
    act(() => result.current.itemRef('b')(bEl))
    const cEl = document.createElement('div')
    mockRect(cEl, { top: 0, bottom: 50, left: 200, right: 300 }) // mid x = 250
    act(() => result.current.itemRef('c')(cEl))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerUp(260, 25)) // past c's midpoint -> insert at the end

    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a'])
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Moved A to position 3 of 3'))
    expect(result.current.isDragging('a')).toBe(false)
  })

  it('does not call onReorder when dropped back at its original position', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder, announce: vi.fn(), labelFor }))

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    const bEl = document.createElement('div')
    mockRect(bEl, { top: 0, bottom: 50, left: 100, right: 200 }) // mid x = 150
    act(() => result.current.itemRef('b')(bEl))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerUp(10, 25)) // well before b's midpoint -> stays at index 0

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('calls onDropOutside and announces removal when dropped outside the container', () => {
    const onReorder = vi.fn()
    const onDropOutside = vi.fn()
    const announce = vi.fn()
    const { result } = renderHook(() =>
      useDragReorder({ ids: ['a', 'b'], onReorder, onDropOutside, announce, labelFor }),
    )

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerUp(9999, 9999))

    expect(onDropOutside).toHaveBeenCalledWith('a')
    expect(onReorder).not.toHaveBeenCalled()
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Removed A'))
  })

  it('does nothing on drop outside when onDropOutside is not given', () => {
    const announce = vi.fn()
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder: vi.fn(), announce, labelFor }))

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerUp(9999, 9999))

    expect(announce).not.toHaveBeenCalled()
  })

  it('tracks whether the pointer is currently over the container while dragging', () => {
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder: vi.fn(), announce: vi.fn(), labelFor }))

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    expect(result.current.isOverContainer).toBe(true)

    act(() => dispatchPointerMove(9999, 9999))
    expect(result.current.isOverContainer).toBe(false)

    act(() => dispatchPointerMove(50, 25))
    expect(result.current.isOverContainer).toBe(true)
  })

  it('drops onto a cross-list target instead of onDropOutside, computing an index against the target rects', () => {
    const onReorder = vi.fn()
    const onDropOutside = vi.fn()
    const onDrop = vi.fn()
    const announce = vi.fn()

    // Target list ("the table"): two items, horizontal.
    const targetContainer = document.createElement('div')
    mockRect(targetContainer, { top: 100, bottom: 150, left: 0, right: 200 })
    const targetItemX = document.createElement('div')
    mockRect(targetItemX, { top: 100, bottom: 150, left: 0, right: 100 }) // mid x = 50
    const targetItemY = document.createElement('div')
    mockRect(targetItemY, { top: 100, bottom: 150, left: 100, right: 200 }) // mid x = 150

    const dropZone = {
      containerRect: () => ({ top: 100, bottom: 150, left: 0, right: 200 }),
      items: () => [
        { id: 'x', rect: { top: 100, bottom: 150, left: 0, right: 100 } },
        { id: 'y', rect: { top: 100, bottom: 150, left: 100, right: 200 } },
      ],
    }

    const { result } = renderHook(() =>
      useDragReorder({
        ids: ['a', 'b'],
        onReorder,
        onDropOutside,
        announce,
        labelFor,
        crossListTarget: { dropZone, axis: 'horizontal', zoneLabel: 'the table', onDrop },
      }),
    )

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerUp(120, 125)) // inside targetContainer, past x's midpoint -> index 1

    expect(onDrop).toHaveBeenCalledWith('a', 1)
    expect(onReorder).not.toHaveBeenCalled()
    expect(onDropOutside).not.toHaveBeenCalled()
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Moved A to the table at position 2'))
  })

  it('excludes the dragged item from its own target rects when already present there', () => {
    const onDrop = vi.fn()
    const dropZone = {
      containerRect: () => ({ top: 100, bottom: 150, left: 0, right: 300 }),
      items: () => [
        { id: 'a', rect: { top: 100, bottom: 150, left: 0, right: 100 } }, // the dragged item's own current slot
        { id: 'y', rect: { top: 100, bottom: 150, left: 100, right: 200 } },
      ],
    }
    const { result } = renderHook(() =>
      useDragReorder({
        ids: ['a', 'b'],
        onReorder: vi.fn(),
        announce: vi.fn(),
        labelFor,
        crossListTarget: { dropZone, axis: 'horizontal', zoneLabel: 'the table', onDrop },
      }),
    )

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerUp(250, 125)) // past y's midpoint (150), among {y} only -> index 1

    expect(onDrop).toHaveBeenCalledWith('a', 1)
  })

  it('falls through to onDropOutside when dropped outside both the container and the cross-list target', () => {
    const onDropOutside = vi.fn()
    const onDrop = vi.fn()
    const dropZone = { containerRect: () => ({ top: 100, bottom: 150, left: 0, right: 200 }), items: () => [] }
    const { result } = renderHook(() =>
      useDragReorder({
        ids: ['a', 'b'],
        onReorder: vi.fn(),
        onDropOutside,
        announce: vi.fn(),
        labelFor,
        crossListTarget: { dropZone, axis: 'horizontal', zoneLabel: 'the table', onDrop },
      }),
    )

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerUp(9999, 9999))

    expect(onDrop).not.toHaveBeenCalled()
    expect(onDropOutside).toHaveBeenCalledWith('a')
  })

  it('exposes a dropZone handle reflecting live container and item rects', () => {
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder: vi.fn(), announce: vi.fn(), labelFor }))

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    const aEl = document.createElement('div')
    mockRect(aEl, { top: 0, bottom: 50, left: 0, right: 100 })
    act(() => result.current.itemRef('a')(aEl))

    expect(result.current.dropZone.containerRect()).toEqual({ top: 0, bottom: 50, left: 0, right: 200 })
    expect(result.current.dropZone.items()).toEqual([{ id: 'a', rect: { top: 0, bottom: 50, left: 0, right: 100 } }])
  })

  it('updates previewIndex live while dragging over the container, and clears it otherwise', () => {
    const { result } = renderHook(() =>
      useDragReorder({ ids: ['a', 'b', 'c'], onReorder: vi.fn(), announce: vi.fn(), labelFor, axis: 'horizontal' }),
    )

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 300 })
    act(() => result.current.containerRef(container))
    const bEl = document.createElement('div')
    mockRect(bEl, { top: 0, bottom: 50, left: 100, right: 200 }) // mid x = 150
    act(() => result.current.itemRef('b')(bEl))
    const cEl = document.createElement('div')
    mockRect(cEl, { top: 0, bottom: 50, left: 200, right: 300 }) // mid x = 250
    act(() => result.current.itemRef('c')(cEl))

    expect(result.current.previewIndex).toBeNull()

    act(() => result.current.onPointerDown('a')(pointerDown()))
    act(() => dispatchPointerMove(160, 25)) // past b's midpoint, before c's -> index 1
    expect(result.current.previewIndex).toBe(1)

    act(() => dispatchPointerMove(9999, 9999)) // leaves the container
    expect(result.current.previewIndex).toBeNull()
  })

  it('updates crossListPreviewIndex while hovering the cross-list target, and clears it on drop', () => {
    const dropZone = {
      containerRect: () => ({ top: 100, bottom: 150, left: 0, right: 200 }),
      items: () => [{ id: 'y', rect: { top: 100, bottom: 150, left: 0, right: 200 } }], // mid x = 100
    }
    const { result } = renderHook(() =>
      useDragReorder({
        ids: ['a', 'b'],
        onReorder: vi.fn(),
        announce: vi.fn(),
        labelFor,
        crossListTarget: { dropZone, axis: 'horizontal', zoneLabel: 'the table', onDrop: vi.fn() },
      }),
    )

    const container = document.createElement('div')
    mockRect(container, { top: 0, bottom: 50, left: 0, right: 200 })
    act(() => result.current.containerRef(container))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    expect(result.current.crossListPreviewIndex).toBeNull()

    act(() => dispatchPointerMove(150, 125)) // inside the target, past y's midpoint -> index 1
    expect(result.current.crossListPreviewIndex).toBe(1)

    act(() => dispatchPointerUp(150, 125))
    expect(result.current.crossListPreviewIndex).toBeNull()
  })

  it('removes its document listeners once the drag ends', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { result } = renderHook(() => useDragReorder({ ids: ['a', 'b'], onReorder: vi.fn(), announce: vi.fn(), labelFor }))

    act(() => result.current.onPointerDown('a')(pointerDown()))
    expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))

    act(() => dispatchPointerUp(0, 0))

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))
  })
})
