import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckChip } from './DeckChip'
import type { Deck } from '../decks/types'

const DECK: Deck = { id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['a', 'b', 'c'], kind: 'user' }

describe('DeckChip', () => {
  it('shows the deck name and card count', () => {
    render(<DeckChip deck={DECK} />)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('applies a hue class matching the deck', () => {
    const { container } = render(<DeckChip deck={DECK} />)
    expect(container.querySelector('.deck-chip--green')).not.toBeNull()
  })

  it('omits the remove button when onRemove is not given', () => {
    render(<DeckChip deck={DECK} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn()
    render(<DeckChip deck={DECK} onRemove={onRemove} />)

    fireEvent.click(screen.getByLabelText('Remove Kitchen from the table'))

    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('uses a custom remove label when given', () => {
    render(<DeckChip deck={DECK} onRemove={vi.fn()} removeLabel="Take Kitchen off the table" />)
    expect(screen.getByLabelText('Take Kitchen off the table')).toBeInTheDocument()
  })

  it('omits the drag handle when drag is not given', () => {
    render(<DeckChip deck={DECK} />)
    expect(screen.queryByLabelText('Reorder Kitchen')).not.toBeInTheDocument()
  })

  it('renders a drag handle wired to the given pointer and keyboard handlers', () => {
    const onPointerDown = vi.fn()
    const onKeyDown = vi.fn()
    render(
      <DeckChip
        deck={DECK}
        drag={{ grabbed: false, dragging: false, onPointerDown, onKeyDown }}
      />,
    )
    const handle = screen.getByLabelText('Reorder Kitchen')

    fireEvent.pointerDown(handle)
    fireEvent.keyDown(handle, { key: 'ArrowRight' })

    expect(onPointerDown).toHaveBeenCalledOnce()
    expect(onKeyDown).toHaveBeenCalledOnce()
  })

  it('reflects grabbed and dragging state as classes and aria-pressed', () => {
    const { container, rerender } = render(
      <DeckChip deck={DECK} drag={{ grabbed: true, dragging: false, onPointerDown: vi.fn(), onKeyDown: vi.fn() }} />,
    )
    expect(container.querySelector('.deck-chip--grabbed')).not.toBeNull()
    expect(screen.getByLabelText('Reorder Kitchen')).toHaveAttribute('aria-pressed', 'true')

    rerender(<DeckChip deck={DECK} drag={{ grabbed: false, dragging: true, onPointerDown: vi.fn(), onKeyDown: vi.fn() }} />)
    expect(container.querySelector('.deck-chip--dragging')).not.toBeNull()
    expect(screen.getByLabelText('Reorder Kitchen')).toHaveAttribute('aria-pressed', 'false')
  })
})
