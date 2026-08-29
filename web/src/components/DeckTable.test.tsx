import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckTable } from './DeckTable'
import type { Deck } from '../decks/types'

function deck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user', ...overrides }
}

describe('DeckTable', () => {
  it('shows a placeholder when no decks are in play', () => {
    render(<DeckTable inPlayDecks={[]} availableDecks={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('No decks on the table')).toBeInTheDocument()
  })

  it('renders a chip per in-play deck', () => {
    const a = deck({ id: 'a', name: 'A' })
    const b = deck({ id: 'b', name: 'B' })
    render(<DeckTable inPlayDecks={[a, b]} availableDecks={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('calls onRemove with the deck id when a chip is removed', () => {
    const onRemove = vi.fn()
    render(<DeckTable inPlayDecks={[deck({ id: 'a', name: 'A' })]} availableDecks={[]} onAdd={vi.fn()} onRemove={onRemove} />)

    fireEvent.click(screen.getByLabelText('Remove A from the table'))

    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('disables the add control when every deck is already in play', () => {
    render(<DeckTable inPlayDecks={[]} availableDecks={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByLabelText('Add a deck to the table')).toBeDisabled()
  })

  it('calls onAdd with the selected deck id', () => {
    const onAdd = vi.fn()
    render(
      <DeckTable
        inPlayDecks={[]}
        availableDecks={[deck({ id: 'a', name: 'A' })]}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Add a deck to the table'), { target: { value: 'a' } })

    expect(onAdd).toHaveBeenCalledWith('a')
  })
})
