import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useDeckLift } from './useDeckLift'
import type { DeckLiftHandlers } from './useDeckLift'

function key(k: string) {
  return { key: k, preventDefault: vi.fn() } as unknown as ReactKeyboardEvent
}

function handlers() {
  const h: DeckLiftHandlers = {
    onReorderLibrary: vi.fn(),
    onReorderPlay: vi.fn(),
    onPlay: vi.fn(),
    onTakeOff: vi.fn(),
    onRestore: vi.fn(),
  }
  return h as { [K in keyof DeckLiftHandlers]: ReturnType<typeof vi.fn> } & DeckLiftHandlers
}

const labelFor = (id: string) => ({ food: 'Food words', travel: 'Travel', dictionary: 'Dictionary' })[id] ?? id

function setup(library = ['food', 'travel'], inPlay = ['dictionary']) {
  const h = handlers()
  const announce = vi.fn()
  const view = renderHook(
    ({ lib, play }: { lib: string[]; play: string[] }) => useDeckLift(lib, play, h, announce, labelFor),
    { initialProps: { lib: library, play: inPlay } },
  )
  return { ...view, h, announce }
}

describe('useDeckLift', () => {
  it('starts with nothing lifted', () => {
    const { result } = setup()
    expect(result.current.liftedId).toBeNull()
    expect(result.current.isLifted('deck', 'food')).toBe(false)
  })

  it('space lifts a deck and announces both directions it can go', () => {
    const { result, announce } = setup()

    act(() => result.current.handleKeyDown('deck', 'food', key(' ')))

    expect(result.current.isLifted('deck', 'food')).toBe(true)
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Right arrow puts it on the table'))
  })

  it('space again drops it', () => {
    const { result, announce } = setup()

    act(() => result.current.handleKeyDown('deck', 'food', key(' ')))
    act(() => result.current.handleKeyDown('deck', 'food', key(' ')))

    expect(result.current.liftedId).toBeNull()
    expect(announce).toHaveBeenCalledWith('Dropped Food words.')
  })

  it('ignores arrows on a deck that was never lifted', () => {
    const { result, h } = setup()
    act(() => result.current.handleKeyDown('deck', 'food', key('ArrowDown')))
    expect(h.onReorderLibrary).not.toHaveBeenCalled()
  })

  describe('while lifted in the library', () => {
    it('right arrow puts the deck on the table and keeps hold of it', () => {
      const { result, h, announce, rerender } = setup()

      act(() => result.current.handleKeyDown('deck', 'food', key(' ')))
      act(() => result.current.handleKeyDown('deck', 'food', key('ArrowRight')))

      expect(h.onPlay).toHaveBeenCalledWith('food', 1)
      expect(announce).toHaveBeenCalledWith('Food words is on the table at position 2.')

      rerender({ lib: ['food', 'travel'], play: ['dictionary', 'food'] })
      expect(result.current.isLifted('chip', 'food')).toBe(true)
    })

    it('up and down reorder the library', () => {
      const { result, h, announce } = setup()

      act(() => result.current.handleKeyDown('deck', 'food', key(' ')))
      act(() => result.current.handleKeyDown('deck', 'food', key('ArrowDown')))

      expect(h.onReorderLibrary).toHaveBeenCalledWith(['travel', 'food'])
      expect(announce).toHaveBeenCalledWith('Moved Food words to position 2 of 2 in the library.')
    })

    it('does nothing at the ends of the library', () => {
      const { result, h } = setup()

      act(() => result.current.handleKeyDown('deck', 'food', key(' ')))
      act(() => result.current.handleKeyDown('deck', 'food', key('ArrowUp')))

      expect(h.onReorderLibrary).not.toHaveBeenCalled()
    })
  })

  describe('while lifted on the table', () => {
    it('left and right reorder the table', () => {
      const { result, h } = setup(['food'], ['dictionary', 'food'])

      act(() => result.current.handleKeyDown('chip', 'food', key(' ')))
      act(() => result.current.handleKeyDown('chip', 'food', key('ArrowLeft')))

      expect(h.onReorderPlay).toHaveBeenCalledWith(['food', 'dictionary'])
    })

    it('up takes the deck off the table and hands it back to the library', () => {
      const { result, h, announce, rerender } = setup(['food'], ['dictionary', 'food'])

      act(() => result.current.handleKeyDown('chip', 'food', key(' ')))
      act(() => result.current.handleKeyDown('chip', 'food', key('ArrowUp')))

      expect(h.onTakeOff).toHaveBeenCalledWith('food')
      expect(announce).toHaveBeenCalledWith('Food words is back in the library.')

      rerender({ lib: ['food'], play: ['dictionary'] })
      expect(result.current.isLifted('deck', 'food')).toBe(true)
    })

    it('left off the front also takes it off, rather than doing nothing', () => {
      const { result, h } = setup(['food'], ['food', 'dictionary'])

      act(() => result.current.handleKeyDown('chip', 'food', key(' ')))
      act(() => result.current.handleKeyDown('chip', 'food', key('ArrowLeft')))

      expect(h.onTakeOff).toHaveBeenCalledWith('food')
      expect(h.onReorderPlay).not.toHaveBeenCalled()
    })

    it('does nothing past the end of the table', () => {
      const { result, h } = setup(['food'], ['dictionary', 'food'])

      act(() => result.current.handleKeyDown('chip', 'food', key(' ')))
      act(() => result.current.handleKeyDown('chip', 'food', key('ArrowRight')))

      expect(h.onReorderPlay).not.toHaveBeenCalled()
    })
  })

  it('escape restores both lists as they were at lift time', () => {
    const { result, h, announce, rerender } = setup(['food', 'travel'], ['dictionary'])

    act(() => result.current.handleKeyDown('deck', 'food', key(' ')))
    act(() => result.current.handleKeyDown('deck', 'food', key('ArrowRight')))
    rerender({ lib: ['food', 'travel'], play: ['dictionary', 'food'] })
    act(() => result.current.handleKeyDown('chip', 'food', key('Escape')))

    expect(h.onRestore).toHaveBeenCalledWith(['food', 'travel'], ['dictionary'])
    expect(result.current.liftedId).toBeNull()
    expect(announce).toHaveBeenCalledWith('Cancelled — Food words is back where it started.')
  })
})
