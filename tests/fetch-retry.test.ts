import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchWithRetry } from '../src/importers/types.js'

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns immediately on a non-429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await fetchWithRetry('https://example.test', {})
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries after a 429, honoring retry-after in seconds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://example.test', {})
    await vi.advanceTimersByTimeAsync(1000)
    const res = await promise

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to exponential backoff when retry-after is absent', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://example.test', {}, { backoffMs: 100 })
    await vi.advanceTimersByTimeAsync(100)
    const res = await promise

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after maxRetries and returns the last 429 response', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://example.test', {}, { maxRetries: 2, backoffMs: 10 })
    await vi.runAllTimersAsync()
    const res = await promise

    expect(res.status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(3) // initial attempt + 2 retries
  })
})
