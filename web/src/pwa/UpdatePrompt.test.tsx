import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdatePrompt } from './UpdatePrompt'

const setNeedRefresh = vi.fn()
const updateServiceWorker = vi.fn()
const setRegistration = vi.fn()
let needRefresh = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: {
    onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void
  }) => {
    options?.onRegisteredSW?.('/sw.js', { scope: '/' } as unknown as ServiceWorkerRegistration)
    return {
      needRefresh: [needRefresh, setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker,
    }
  },
}))

vi.mock('./registration', () => ({
  setRegistration: (registration: ServiceWorkerRegistration | undefined) => setRegistration(registration),
}))

describe('UpdatePrompt', () => {
  afterEach(() => {
    cleanup()
    needRefresh = false
    setNeedRefresh.mockClear()
    updateServiceWorker.mockClear()
    setRegistration.mockClear()
  })

  it('hands the registration off for the manual "check for updates" control to use', () => {
    render(<UpdatePrompt />)
    expect(setRegistration).toHaveBeenCalledWith({ scope: '/' })
  })

  it('renders nothing until the service worker says an update is waiting', () => {
    needRefresh = false
    const { container } = render(<UpdatePrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers to reload once an update is waiting', () => {
    needRefresh = true
    render(<UpdatePrompt />)
    expect(screen.getByText('An update is available.')).toBeInTheDocument()
  })

  it('reload activates the waiting worker and reloads the page', () => {
    needRefresh = true
    render(<UpdatePrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('dismiss clears the prompt without reloading', () => {
    needRefresh = true
    render(<UpdatePrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(setNeedRefresh).toHaveBeenCalledWith(false)
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })
})
