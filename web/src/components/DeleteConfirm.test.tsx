import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeleteConfirm } from './DeleteConfirm'

describe('DeleteConfirm', () => {
  it('starts closed, with its confirm panel not in the document', () => {
    render(<DeleteConfirm label="Kitchen" onConfirm={vi.fn()} />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Delete Kitchen')).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the confirmation panel on trigger click', () => {
    render(<DeleteConfirm label="Kitchen" onConfirm={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Delete Kitchen'))

    expect(screen.getByRole('group', { name: 'Confirm delete Kitchen' })).toBeInTheDocument()
    expect(screen.getByLabelText('Delete Kitchen')).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles closed on a second trigger click', () => {
    render(<DeleteConfirm label="Kitchen" onConfirm={vi.fn()} />)
    const trigger = screen.getByLabelText('Delete Kitchen')

    fireEvent.click(trigger)
    fireEvent.click(trigger)

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('closes on Escape without confirming', () => {
    const onConfirm = vi.fn()
    render(<DeleteConfirm label="Kitchen" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByLabelText('Delete Kitchen'))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes on an outside click without confirming', () => {
    const onConfirm = vi.fn()
    render(<DeleteConfirm label="Kitchen" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByLabelText('Delete Kitchen'))

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not close on a click inside the panel', () => {
    render(<DeleteConfirm label="Kitchen" onConfirm={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Delete Kitchen'))

    fireEvent.mouseDown(screen.getByRole('group'))

    expect(screen.getByRole('group')).toBeInTheDocument()
  })

  it('Cancel closes without confirming', () => {
    const onConfirm = vi.fn()
    render(<DeleteConfirm label="Kitchen" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByLabelText('Delete Kitchen'))

    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirming calls onConfirm and closes the panel', () => {
    const onConfirm = vi.fn()
    render(<DeleteConfirm label="Kitchen" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByLabelText('Delete Kitchen'))

    fireEvent.click(screen.getByLabelText('Confirm deleting Kitchen'))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
