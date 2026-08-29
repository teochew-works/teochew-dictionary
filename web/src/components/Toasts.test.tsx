import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Toasts } from './Toasts'

describe('Toasts', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<Toasts toasts={[]} onDismiss={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows each message', () => {
    render(<Toasts toasts={[{ id: 1, message: 'Deleted Travel' }]} onDismiss={vi.fn()} />)
    expect(screen.getByText('Deleted Travel')).toBeInTheDocument()
  })

  it('offers Undo only when the action is reversible', () => {
    render(<Toasts toasts={[{ id: 1, message: 'Saved “Morning drill”' }]} onDismiss={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('undoes and dismisses in one press', () => {
    const onUndo = vi.fn()
    const onDismiss = vi.fn()
    render(<Toasts toasts={[{ id: 7, message: 'Deleted Travel', onUndo }]} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onUndo).toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalledWith(7)
  })

  it('is not itself a live region — the view announces these separately', () => {
    const { container } = render(<Toasts toasts={[{ id: 1, message: 'Deleted Travel' }]} onDismiss={vi.fn()} />)
    expect(container.querySelector('[aria-live]')).toBeNull()
  })
})
