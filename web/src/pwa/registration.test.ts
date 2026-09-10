import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, setRegistration } from './registration'

describe('registration', () => {
  afterEach(() => {
    setRegistration(undefined)
  })

  it('reports no update check is possible before a registration is known', async () => {
    expect(await checkForUpdate()).toBe(false)
  })

  it('asks the registered service worker to re-check once one is known', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    setRegistration({ update } as unknown as ServiceWorkerRegistration)

    expect(await checkForUpdate()).toBe(true)
    expect(update).toHaveBeenCalled()
  })
})
