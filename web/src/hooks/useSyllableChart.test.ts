import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSyllableChart } from './useSyllableChart'
import type { SyllableChart } from '../types/syllable-chart'

const CHART: SyllableChart = {
  list: 'syllable-chart',
  initials: [{ pengim: '' }],
  rimes: ['a'],
  cells: [{ initial: '', rime: 'a', legalTones: [1], attestedTones: [1], recordedTones: [], stagedTones: [] }],
  coverage: {
    cellsAttested: 1,
    cellsWithRecording: 0,
    syllablesAttested: 1,
    syllablesRecorded: 0,
    cellsWithStaging: 0,
    syllablesStaged: 0,
  },
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(CHART), { status: 200 }))),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSyllableChart under StrictMode (issue #226)', () => {
  // Deep-linking straight into chart mode (#sounds/chart/<initial>/<rime>) means
  // `enabled` can be true on the very first render — the first code path that
  // exercises StrictMode's dev-only mount → cleanup → remount cycle for this
  // hook's effect. It used to get stuck in `loading: true` forever because a
  // ref guard was set synchronously before the fetch started, so the
  // StrictMode-cancelled first invocation permanently blocked the second,
  // real invocation from ever issuing its own fetch.
  it('resolves data rather than getting stuck loading when enabled from the first render', async () => {
    stubFetch()
    const { result } = renderHook(() => useSyllableChart(true), { wrapper: StrictMode })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(CHART)
    expect(result.current.error).toBeNull()
  })

  it('does not re-fetch once loaded, even after enabled toggles off and on', async () => {
    stubFetch()
    const { result, rerender } = renderHook(({ enabled }) => useSyllableChart(enabled), {
      wrapper: StrictMode,
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // StrictMode's dev-only double-invoke means the initial mount can legitimately
    // issue two real fetch() calls (one cancelled, one kept) — what matters here is
    // that toggling `enabled` off and back on afterwards issues no further calls.
    const callsAfterInitialLoad = vi.mocked(fetch).mock.calls.length

    rerender({ enabled: false })
    rerender({ enabled: true })

    expect(fetch).toHaveBeenCalledTimes(callsAfterInitialLoad)
  })
})
