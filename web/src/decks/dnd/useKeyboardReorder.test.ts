import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useKeyboardReorder } from './useKeyboardReorder'

function key(k: string) {
  return { key: k, preventDefault: vi.fn() } as unknown as ReactKeyboardEvent
}

const labelFor = (id: string) => ({ a: 'A', b: 'B', c: 'C' })[id] ?? id

describe('useKeyboardReorder', () => {
  it('is not grabbed initially', () => {
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b', 'c'], vi.fn(), vi.fn(), labelFor))
    expect(result.current.isGrabbed('a')).toBe(false)
  })

  it('Space picks up an item and announces it', () => {
    const announce = vi.fn()
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b', 'c'], vi.fn(), announce, labelFor))

    act(() => result.current.handleKeyDown('b', key(' ')))

    expect(result.current.isGrabbed('b')).toBe(true)
    expect(result.current.isGrabbed('a')).toBe(false)
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Picked up B'))
  })

  it('ArrowRight moves a grabbed item later and calls onReorder', () => {
    const onReorder = vi.fn()
    const announce = vi.fn()
    const { result, rerender } = renderHook(({ ids }) => useKeyboardReorder(ids, onReorder, announce, labelFor), {
      initialProps: { ids: ['a', 'b', 'c'] },
    })

    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key('ArrowRight')))

    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Moved A to position 2 of 3'))

    // Simulate the parent applying the new order, as it would via the store.
    rerender({ ids: ['b', 'a', 'c'] })
    expect(result.current.isGrabbed('a')).toBe(true)
  })

  it('ArrowLeft/ArrowUp move a grabbed item earlier', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b', 'c'], onReorder, vi.fn(), labelFor))

    act(() => result.current.handleKeyDown('c', key(' ')))
    act(() => result.current.handleKeyDown('c', key('ArrowLeft')))

    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b'])
  })

  it('does not move past either end of the list', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b', 'c'], onReorder, vi.fn(), labelFor))

    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key('ArrowLeft')))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('arrow keys do nothing when nothing is grabbed', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b', 'c'], onReorder, vi.fn(), labelFor))

    act(() => result.current.handleKeyDown('a', key('ArrowRight')))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('arrow keys on a different item than the grabbed one do nothing', () => {
    const onReorder = vi.fn()
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b', 'c'], onReorder, vi.fn(), labelFor))

    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('b', key('ArrowRight')))

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('Space again drops the grabbed item and announces the drop', () => {
    const announce = vi.fn()
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b', 'c'], vi.fn(), announce, labelFor))

    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key(' ')))

    expect(result.current.isGrabbed('a')).toBe(false)
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Dropped A at position 1 of 3'))
  })

  it('Escape reverts to the order captured at lift time', () => {
    const onReorder = vi.fn()
    const announce = vi.fn()
    const { result, rerender } = renderHook(({ ids }) => useKeyboardReorder(ids, onReorder, announce, labelFor), {
      initialProps: { ids: ['a', 'b', 'c'] },
    })

    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key('ArrowRight')))
    rerender({ ids: ['b', 'a', 'c'] })

    act(() => result.current.handleKeyDown('a', key('Escape')))

    expect(onReorder).toHaveBeenLastCalledWith(['a', 'b', 'c'])
    expect(result.current.isGrabbed('a')).toBe(false)
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Cancelled'))
  })

  it('ignores an id that is not in the list', () => {
    const onReorder = vi.fn()
    const announce = vi.fn()
    const { result } = renderHook(() => useKeyboardReorder(['a', 'b'], onReorder, announce, labelFor))

    act(() => result.current.handleKeyDown('ghost', key(' ')))

    expect(announce).not.toHaveBeenCalled()
  })
})
