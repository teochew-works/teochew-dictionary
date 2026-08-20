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

  // Real timers here: AbortSignal.timeout runs on platform timers that fake
  // timers don't drive, and the delays below are small enough to stay fast.
  it('gives each retry attempt its own timeout budget, so backoff time is not counted against it', async () => {
    const seenSignals: (AbortSignal | undefined)[] = []
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seenSignals.push(init?.signal ?? undefined)
      return seenSignals.length === 1 ? new Response('', { status: 429 }) : new Response('ok', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    // Backoff alone (60ms) outlasts the per-attempt timeout (30ms). A signal
    // shared across attempts — the bug this guards against — would already be
    // aborted by the time the second fetch fires.
    const res = await fetchWithRetry('https://example.test', {}, { backoffMs: 60, timeoutMs: 30 })

    expect(res.status).toBe(200)
    expect(seenSignals).toHaveLength(2)
    expect(seenSignals[0]).not.toBe(seenSignals[1])
    expect(seenSignals[1]?.aborted).toBe(false)
  })

  it('still aborts a single attempt that genuinely stalls past its timeout', async () => {
    const fetchMock = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithRetry('https://example.test', {}, { timeoutMs: 20 })).rejects.toThrow()
  })
})
