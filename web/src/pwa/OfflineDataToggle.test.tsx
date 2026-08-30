import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OfflineDataToggle } from './OfflineDataToggle'

const isDictAvailableOffline = vi.fn()
const fetchDictSize = vi.fn()
const enableDictOffline = vi.fn()
const disableDictOffline = vi.fn()

vi.mock('./offlineData', () => ({
  isDictAvailableOffline: () => isDictAvailableOffline(),
  fetchDictSize: () => fetchDictSize(),
  enableDictOffline: () => enableDictOffline(),
  disableDictOffline: () => disableDictOffline(),
}))

describe('OfflineDataToggle', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('starts unchecked and names the size, when the browser is not already caching it', async () => {
    isDictAvailableOffline.mockResolvedValue(false)
    fetchDictSize.mockResolvedValue(2_500_000)

    render(<OfflineDataToggle />)

    expect(await screen.findByText('Available offline (2.4 MB)')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('reflects an already-cached copy as checked', async () => {
    isDictAvailableOffline.mockResolvedValue(true)
    fetchDictSize.mockResolvedValue(null)

    render(<OfflineDataToggle />)

    expect(await screen.findByRole('checkbox')).toBeChecked()
  })

  it('caches the dictionary when switched on', async () => {
    isDictAvailableOffline.mockResolvedValue(false)
    fetchDictSize.mockResolvedValue(null)
    enableDictOffline.mockResolvedValue(undefined)

    render(<OfflineDataToggle />)
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)

    expect(enableDictOffline).toHaveBeenCalled()
    await screen.findByRole('checkbox')
    expect(checkbox).toBeChecked()
  })

  it('removes the cached copy when switched off', async () => {
    isDictAvailableOffline.mockResolvedValue(true)
    fetchDictSize.mockResolvedValue(null)
    disableDictOffline.mockResolvedValue(undefined)

    render(<OfflineDataToggle />)
    const checkbox = await screen.findByRole('checkbox')
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)
    expect(disableDictOffline).toHaveBeenCalled()
  })

  it('shows the error and leaves the toggle unchanged when caching fails', async () => {
    isDictAvailableOffline.mockResolvedValue(false)
    fetchDictSize.mockResolvedValue(null)
    enableDictOffline.mockRejectedValue(new Error('quota exceeded'))

    render(<OfflineDataToggle />)
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)

    expect(await screen.findByText('quota exceeded')).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
  })
})
