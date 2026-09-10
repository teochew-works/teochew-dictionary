import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CheckForUpdate } from './CheckForUpdate'

const checkForUpdate = vi.fn()

vi.mock('./registration', () => ({
  checkForUpdate: () => checkForUpdate(),
}))

describe('CheckForUpdate', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reports the check completed once a registration is known', async () => {
    checkForUpdate.mockResolvedValue(true)

    render(<CheckForUpdate />)
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Checked')
  })

  it('reports updates are unavailable when there is no service worker registration', async () => {
    checkForUpdate.mockResolvedValue(false)

    render(<CheckForUpdate />)
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))

    expect(await screen.findByRole('status')).toHaveTextContent("aren't available")
  })
})
