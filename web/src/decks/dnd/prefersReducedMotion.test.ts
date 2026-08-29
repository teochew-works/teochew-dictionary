import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion } from './prefersReducedMotion'

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

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when the media query matches', () => {
    mockMatchMedia(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('returns false when the media query does not match', () => {
    mockMatchMedia(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
