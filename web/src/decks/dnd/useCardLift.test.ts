import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCardLift } from './useCardLift'

function key(k: string) {
  return { key: k, preventDefault: vi.fn() } as unknown as ReactKeyboardEvent
}

const labelFor = (id: string) => ({ a: '茶', b: '飯', c: '九' })[id] ?? id

function setup(ids = ['a', 'b', 'c']) {
  const onReorder = vi.fn()
  const announce = vi.fn()
  const view = renderHook(({ entryIds }: { entryIds: string[] }) => useCardLift(entryIds, onReorder, announce, labelFor), {
    initialProps: { entryIds: ids },
  })
  return { ...view, onReorder, announce }
}

describe('useCardLift', () => {
  it('starts with nothing lifted', () => {
    const { result } = setup()
    expect(result.current.liftedId).toBeNull()
  })

  it('space lifts a card and says what the arrows will do', () => {
    const { result, announce } = setup()
    act(() => result.current.handleKeyDown('a', key(' ')))
    expect(result.current.isLifted('a')).toBe(true)
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Picked up 茶'))
  })

  it('space again drops it where it now sits', () => {
    const { result, announce } = setup()
    act(() => result.current.handleKeyDown('b', key(' ')))
    act(() => result.current.handleKeyDown('b', key(' ')))
    expect(result.current.liftedId).toBeNull()
    expect(announce).toHaveBeenCalledWith('Dropped 飯 at position 2 of 3.')
  })

  it('ignores arrows on a card that was never lifted', () => {
    const { result, onReorder } = setup()
    act(() => result.current.handleKeyDown('a', key('ArrowRight')))
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('moves a lifted card one position at a time', () => {
    const { result, onReorder, announce } = setup()
    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key('ArrowRight')))
    expect(onReorder).toHaveBeenCalledWith('a', 1)
    expect(announce).toHaveBeenCalledWith('Moved 茶 to position 2 of 3.')
  })

  it('treats both axes the same, because the list wraps', () => {
    const { result, onReorder } = setup()
    act(() => result.current.handleKeyDown('b', key(' ')))
    act(() => result.current.handleKeyDown('b', key('ArrowUp')))
    expect(onReorder).toHaveBeenCalledWith('b', 0)
    act(() => result.current.handleKeyDown('b', key('ArrowDown')))
    expect(onReorder).toHaveBeenLastCalledWith('b', 2)
  })

  it('does nothing at the ends of the list', () => {
    const { result, onReorder } = setup()
    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key('ArrowLeft')))
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('escape puts the card back where it was lifted from', () => {
    const { result, onReorder, announce, rerender } = setup()
    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key('ArrowRight')))
    rerender({ entryIds: ['b', 'a', 'c'] })

    act(() => result.current.handleKeyDown('a', key('Escape')))

    expect(onReorder).toHaveBeenLastCalledWith('a', 0)
    expect(result.current.liftedId).toBeNull()
    expect(announce).toHaveBeenCalledWith('Cancelled — 茶 is back where it started.')
  })

  it('escape without a move puts nothing back', () => {
    const { result, onReorder } = setup()
    act(() => result.current.handleKeyDown('a', key(' ')))
    act(() => result.current.handleKeyDown('a', key('Escape')))
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('ignores a card that has left the list', () => {
    const { result, onReorder } = setup()
    act(() => result.current.handleKeyDown('gone', key(' ')))
    expect(result.current.liftedId).toBeNull()
    expect(onReorder).not.toHaveBeenCalled()
  })
})
