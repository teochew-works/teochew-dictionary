import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDragGhost } from './useDragGhost'

function mockRaf() {
  let queue: FrameRequestCallback[] = []
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.push(cb)
    return ++id
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return {
    flush(time: number) {
      const current = queue
      queue = []
      current.forEach((cb) => cb(time))
    },
  }
}

function mockMatchMedia(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as MediaQueryList)
}

describe('useDragGhost', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns null when inactive', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useDragGhost(false))
    expect(result.current.position).toBeNull()
  })

  it('returns null and never starts an rAF loop when reduced motion is preferred', () => {
    mockMatchMedia(true)
    const raf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)

    const { result } = renderHook(() => useDragGhost(true))

    expect(result.current.position).toBeNull()
    expect(raf).not.toHaveBeenCalled()
  })

  it('tracks the pointer and eases toward it, frame by frame', () => {
    mockMatchMedia(false)
    const raf = mockRaf()
    const { result } = renderHook(() => useDragGhost(true))

    act(() => document.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 50 })))
    act(() => raf.flush(0)) // first tick just records the baseline time

    act(() => document.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 50 })))
    act(() => raf.flush(100))

    expect(result.current.position).not.toBeNull()
    expect(result.current.position!.x).toBeGreaterThan(100)
    expect(result.current.position!.x).toBeLessThan(200)
  })

  it('cancels the rAF loop and removes its pointer listener once deactivated', () => {
    mockMatchMedia(false)
    mockRaf()
    const cancelSpy = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { rerender } = renderHook(({ active }) => useDragGhost(active), { initialProps: { active: true } })
    rerender({ active: false })

    expect(cancelSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
  })
})
