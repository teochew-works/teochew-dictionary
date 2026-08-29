import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CardFileControls } from './CardFileControls'
import type { Deck } from '../decks/types'

const DECKS: Deck[] = [
  { id: 'a', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' },
  { id: 'b', name: 'Travel', hue: 'blue', cards: [], kind: 'user' },
]

describe('CardFileControls', () => {
  it('lists every user deck in the select', () => {
    render(<CardFileControls headword="頭" userDecks={DECKS} dragging={false} onPointerDown={vi.fn()} onFile={vi.fn()} />)
    expect(screen.getByRole('option', { name: 'Kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Travel' })).toBeInTheDocument()
  })

  it('calls onFile with the selected deck id', () => {
    const onFile = vi.fn()
    render(<CardFileControls headword="頭" userDecks={DECKS} dragging={false} onPointerDown={vi.fn()} onFile={onFile} />)

    fireEvent.change(screen.getByLabelText('File 頭 into a deck'), { target: { value: 'b' } })

    expect(onFile).toHaveBeenCalledWith('b')
  })

  it('calls onPointerDown when the drag handle is pressed', () => {
    const onPointerDown = vi.fn()
    render(<CardFileControls headword="頭" userDecks={DECKS} dragging={false} onPointerDown={onPointerDown} onFile={vi.fn()} />)

    fireEvent.pointerDown(screen.getByLabelText('Drag to file 頭 into a deck'))

    expect(onPointerDown).toHaveBeenCalledOnce()
  })

  it('applies a dragging class while dragging', () => {
    const { container } = render(
      <CardFileControls headword="頭" userDecks={DECKS} dragging={true} onPointerDown={vi.fn()} onFile={vi.fn()} />,
    )
    expect(container.querySelector('.card-file-controls--dragging')).not.toBeNull()
  })
})
