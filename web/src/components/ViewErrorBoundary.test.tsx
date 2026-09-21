import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewErrorBoundary } from './ViewErrorBoundary'

it('offers recovery when a view fails rather than leaving a blank screen', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  function Broken(): never { throw new Error('Chunk unavailable') }
  try {
    render(<ViewErrorBoundary><Broken /></ViewErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('This view could not load')
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeInTheDocument()
  } finally { errors.mockRestore() }
})
