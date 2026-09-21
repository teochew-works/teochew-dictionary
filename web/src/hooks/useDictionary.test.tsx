import { afterEach, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDictionary } from './useDictionary'

vi.mock('../pwa/offlineData', () => ({ fetchDict: () => fetch('/data/dict.json') }))
afterEach(() => vi.unstubAllGlobals())
it('defers loading until needed and reuses the result on return', async () => {
  const fetcher = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ entries: [], meta: {} }))))
  vi.stubGlobal('fetch', fetcher)
  const { result, rerender } = renderHook(({ enabled }) => useDictionary(enabled), { initialProps: { enabled: false } })
  expect(fetcher).not.toHaveBeenCalled()
  rerender({ enabled: true })
  await waitFor(() => expect(result.current.loading).toBe(false))
  const data = result.current.data
  rerender({ enabled: false })
  rerender({ enabled: true })
  await waitFor(() => expect(result.current.data).toBe(data))
  expect(fetcher).toHaveBeenCalledTimes(1)
})
