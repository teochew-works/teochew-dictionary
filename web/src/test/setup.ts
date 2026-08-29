import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
})

// jsdom doesn't implement matchMedia. Default to "no preference" (motion
// allowed) everywhere; decks/dnd/prefersReducedMotion.ts is the only caller
// that needs a real answer, and its own tests override this per case via
// vi.spyOn(window, 'matchMedia').
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
