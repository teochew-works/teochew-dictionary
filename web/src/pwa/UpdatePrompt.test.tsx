import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { UpdatePrompt } from './UpdatePrompt'

const setNeedRefresh = vi.fn()
const updateServiceWorker = vi.fn()
let needRefresh = false

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}))

describe('UpdatePrompt', () => {
  afterEach(() => {
    cleanup()
    needRefresh = false
    setNeedRefresh.mockClear()
    updateServiceWorker.mockClear()
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
