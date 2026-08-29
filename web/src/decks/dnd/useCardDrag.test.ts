import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCardDrag } from './useCardDrag'

function mockRect(el: HTMLElement, rect: { top: number; bottom: number; left: number; right: number }) {
  el.getBoundingClientRect = () => ({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  })
}

function pointerDown() {
  return { button: 0 } as unknown as ReactPointerEvent
}

describe('useCardDrag', () => {
  it('is not dragging initially', () => {
    const { result } = renderHook(() => useCardDrag({ targets: [], onFile: vi.fn(), onRefused: vi.fn() }))
    expect(result.current.isDragging).toBe(false)
    expect(result.current.overId).toBeNull()
  })

  it('starts dragging on primary pointerdown', () => {
    const { result } = renderHook(() => useCardDrag({ targets: [], onFile: vi.fn(), onRefused: vi.fn() }))
    act(() => result.current.onPointerDown(pointerDown()))
    expect(result.current.isDragging).toBe(true)
  })

  it('ignores a non-primary-button pointerdown', () => {
    const { result } = renderHook(() => useCardDrag({ targets: [], onFile: vi.fn(), onRefused: vi.fn() }))
    act(() => result.current.onPointerDown({ button: 2 } as unknown as ReactPointerEvent))
    expect(result.current.isDragging).toBe(false)
  })

  it('calls onFile when dropped on a user deck target', () => {
    const onFile = vi.fn()
    const onRefused = vi.fn()
    const { result } = renderHook(() =>
      useCardDrag({ targets: [{ id: 'deck-1', isVirtual: false }], onFile, onRefused }),
    )
    const el = document.createElement('div')
    mockRect(el, { top: 0, bottom: 50, left: 0, right: 50 })
    act(() => result.current.targetRef('deck-1')(el))

    act(() => result.current.onPointerDown(pointerDown()))
    act(() => document.dispatchEvent(new PointerEvent('pointerup', { clientX: 25, clientY: 25 })))

    expect(onFile).toHaveBeenCalledWith('deck-1')
    expect(onRefused).not.toHaveBeenCalled()
    expect(result.current.isDragging).toBe(false)
  })

  it('calls onRefused instead of onFile when dropped on a virtual deck target', () => {
    const onFile = vi.fn()
    const onRefused = vi.fn()
    const { result } = renderHook(() =>
      useCardDrag({ targets: [{ id: 'dictionary', isVirtual: true }], onFile, onRefused }),
    )
    const el = document.createElement('div')
    mockRect(el, { top: 0, bottom: 50, left: 0, right: 50 })
    act(() => result.current.targetRef('dictionary')(el))

    act(() => result.current.onPointerDown(pointerDown()))
    act(() => document.dispatchEvent(new PointerEvent('pointerup', { clientX: 25, clientY: 25 })))

    expect(onRefused).toHaveBeenCalledWith('dictionary')
    expect(onFile).not.toHaveBeenCalled()
  })

  it('does nothing when dropped outside every target', () => {
    const onFile = vi.fn()
    const onRefused = vi.fn()
    const { result } = renderHook(() =>
      useCardDrag({ targets: [{ id: 'deck-1', isVirtual: false }], onFile, onRefused }),
    )
    const el = document.createElement('div')
    mockRect(el, { top: 0, bottom: 50, left: 0, right: 50 })
    act(() => result.current.targetRef('deck-1')(el))

    act(() => result.current.onPointerDown(pointerDown()))
    act(() => document.dispatchEvent(new PointerEvent('pointerup', { clientX: 9999, clientY: 9999 })))

    expect(onFile).not.toHaveBeenCalled()
    expect(onRefused).not.toHaveBeenCalled()
  })

  it('tracks overId as the pointer moves across targets', () => {
    const { result } = renderHook(() =>
      useCardDrag({ targets: [{ id: 'deck-1', isVirtual: false }], onFile: vi.fn(), onRefused: vi.fn() }),
    )
    const el = document.createElement('div')
    mockRect(el, { top: 0, bottom: 50, left: 0, right: 50 })
    act(() => result.current.targetRef('deck-1')(el))

    act(() => result.current.onPointerDown(pointerDown()))
    act(() => document.dispatchEvent(new PointerEvent('pointermove', { clientX: 25, clientY: 25 })))
    expect(result.current.overId).toBe('deck-1')

    act(() => document.dispatchEvent(new PointerEvent('pointermove', { clientX: 9999, clientY: 9999 })))
    expect(result.current.overId).toBeNull()
  })
})
