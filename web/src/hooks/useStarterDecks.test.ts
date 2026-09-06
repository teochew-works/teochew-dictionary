import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStarterDecks } from './useStarterDecks'
import type { StarterDecksCatalog } from '../types/starter-decks'

const CATALOG: StarterDecksCatalog = { decks: [{ id: 'animals', name: 'Animals', cards: ['a'] }] }

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(CATALOG), { status: 200 }))),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useStarterDecks under StrictMode (issue #226)', () => {
  // Deep-linking straight into the marketplace drawer (#flashcards/marketplace)
  // means `enabled` can be true on the very first render — see
  // useSyllableChart.test.ts for the full explanation of the bug this guards
  // against (a ref set synchronously before the fetch started let a
  // StrictMode-cancelled first invocation permanently block the second, real
  // one from ever fetching, so the panel got stuck on "Loading…" forever).
  it('resolves data rather than getting stuck loading when enabled from the first render', async () => {
    stubFetch()
    const { result } = renderHook(() => useStarterDecks(true), { wrapper: StrictMode })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(CATALOG)
    expect(result.current.error).toBeNull()
  })

  it('does not re-fetch once loaded, even after enabled toggles off and on', async () => {
    stubFetch()
    const { result, rerender } = renderHook(({ enabled }) => useStarterDecks(enabled), {
      wrapper: StrictMode,
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsAfterInitialLoad = vi.mocked(fetch).mock.calls.length

    rerender({ enabled: false })
    rerender({ enabled: true })

    expect(fetch).toHaveBeenCalledTimes(callsAfterInitialLoad)
  })
})
