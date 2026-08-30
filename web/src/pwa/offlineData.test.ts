import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disableDictOffline, enableDictOffline, fetchDict, fetchDictSize, isDictAvailableOffline } from './offlineData'

/**
 * jsdom has no Cache Storage API, so `caches` is stubbed with the minimal
 * subset offlineData.ts actually calls: one named store, keyed by request URL.
 */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  function store(name: string) {
    let s = stores.get(name)
    if (!s) {
      s = new Map()
      stores.set(name, s)
    }
    return s
  }
  return {
    open: (name: string) =>
      Promise.resolve({
        match: (url: string) => Promise.resolve(store(name).get(url)),
        put: (url: string, res: Response) => {
          store(name).set(url, res)
          return Promise.resolve()
        },
        delete: (url: string) => Promise.resolve(store(name).delete(url)),
      }),
  }
}

describe('offlineData', () => {
  beforeEach(() => {
    vi.stubGlobal('caches', fakeCaches())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('is not offline-available before anything has been cached', async () => {
    expect(await isDictAvailableOffline()).toBe(false)
  })

  it('caches dict.json on enable, and fetchDict then serves it without hitting the network', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{"entries":[]}'))

    await enableDictOffline()
    expect(await isDictAvailableOffline()).toBe(true)

    fetchSpy.mockClear()
    const res = await fetchDict()
    expect(await res.text()).toBe('{"entries":[]}')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falls straight through to the network when nothing is cached', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{"entries":[]}'))
    const res = await fetchDict()
    expect(res.status).toBe(200)
  })

  it('surfaces a failed fetch rather than caching a broken response', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(new Response('not found', { status: 404, statusText: 'Not Found' }))
    await expect(enableDictOffline()).rejects.toThrow('fetch failed: 404')
    expect(await isDictAvailableOffline()).toBe(false)
  })

  it('removes the cached copy on disable', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{"entries":[]}'))
    await enableDictOffline()
    expect(await isDictAvailableOffline()).toBe(true)

    await disableDictOffline()
    expect(await isDictAvailableOffline()).toBe(false)
  })

  it('reads the size off Content-Length without downloading the body', async () => {
    const fetchSpy = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(new Response(null, { headers: { 'content-length': '2500000' } }))

    expect(await fetchDictSize()).toBe(2_500_000)
    expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), { method: 'HEAD' })
  })

  it('returns null rather than throwing when the size can\'t be determined', async () => {
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await fetchDictSize()).toBeNull()
  })
})
