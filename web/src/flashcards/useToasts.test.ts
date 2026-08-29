import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToasts } from './useToasts'

describe('useToasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts empty', () => {
    const { result } = renderHook(() => useToasts())
    expect(result.current.toasts).toEqual([])
  })

  it('stacks messages in the order they arrive', () => {
    const { result } = renderHook(() => useToasts())
    act(() => result.current.push('first'))
    act(() => result.current.push('second'))
    expect(result.current.toasts.map((t) => t.message)).toEqual(['first', 'second'])
  })

  it('expires a plain confirmation after a couple of seconds', () => {
    const { result } = renderHook(() => useToasts())
    act(() => result.current.push('Saved'))
    act(() => vi.advanceTimersByTime(2600))
    expect(result.current.toasts).toEqual([])
  })

  it('keeps an undoable toast up longer, so there is time to take it', () => {
    const { result } = renderHook(() => useToasts())
    act(() => result.current.push('Deleted Travel', vi.fn()))
    act(() => vi.advanceTimersByTime(2600))
    expect(result.current.toasts).toHaveLength(1)
    act(() => vi.advanceTimersByTime(2600))
    expect(result.current.toasts).toEqual([])
  })

  it('dismisses by id without touching the others', () => {
    const { result } = renderHook(() => useToasts())
    act(() => result.current.push('first'))
    act(() => result.current.push('second'))
    const first = result.current.toasts[0]!.id
    act(() => result.current.dismiss(first))
    expect(result.current.toasts.map((t) => t.message)).toEqual(['second'])
  })

  it('carries the undo callback through to the toast', () => {
    const onUndo = vi.fn()
    const { result } = renderHook(() => useToasts())
    act(() => result.current.push('Deleted Travel', onUndo))
    result.current.toasts[0]!.onUndo?.()
    expect(onUndo).toHaveBeenCalled()
  })
})
