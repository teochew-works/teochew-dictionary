import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckTable } from './DeckTable'
import type { Deck } from '../decks/types'

function deck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user', ...overrides }
}

function renderTable(props: Partial<Parameters<typeof DeckTable>[0]> = {}) {
  return render(
    <DeckTable
      inPlayDecks={[]}
      availableDecks={[]}
      onAdd={vi.fn()}
      onRemove={vi.fn()}
      onReorder={vi.fn()}
      announce={vi.fn()}
      {...props}
    />,
  )
}

describe('DeckTable', () => {
  it('shows a placeholder when no decks are in play', () => {
    renderTable()
    expect(screen.getByText('No decks on the table')).toBeInTheDocument()
  })

  it('renders a chip per in-play deck', () => {
    const a = deck({ id: 'a', name: 'A' })
    const b = deck({ id: 'b', name: 'B' })
    renderTable({ inPlayDecks: [a, b] })
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('calls onRemove with the deck id when a chip is removed', () => {
    const onRemove = vi.fn()
    renderTable({ inPlayDecks: [deck({ id: 'a', name: 'A' })], onRemove })

    fireEvent.click(screen.getByLabelText('Remove A from the table'))

    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('disables the add control when every deck is already in play', () => {
    renderTable()
    expect(screen.getByLabelText('Add a deck to the table')).toBeDisabled()
  })

  it('calls onAdd with the selected deck id', () => {
    const onAdd = vi.fn()
    renderTable({ availableDecks: [deck({ id: 'a', name: 'A' })], onAdd })

    fireEvent.change(screen.getByLabelText('Add a deck to the table'), { target: { value: 'a' } })

    expect(onAdd).toHaveBeenCalledWith('a')
  })

  it('gives every in-play deck a keyboard-operable reorder handle', () => {
    const a = deck({ id: 'a', name: 'A' })
    const b = deck({ id: 'b', name: 'B' })
    renderTable({ inPlayDecks: [a, b] })

    expect(screen.getByLabelText('Reorder A')).toBeInTheDocument()
    expect(screen.getByLabelText('Reorder B')).toBeInTheDocument()
  })

  it('reorders via the keyboard lift/arrow/drop pattern and announces each step', () => {
    const onReorder = vi.fn()
    const announce = vi.fn()
    const a = deck({ id: 'a', name: 'A' })
    const b = deck({ id: 'b', name: 'B' })
    renderTable({ inPlayDecks: [a, b], onReorder, announce })

    const handle = screen.getByLabelText('Reorder A')
    fireEvent.keyDown(handle, { key: ' ' })
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Picked up A'))

    fireEvent.keyDown(handle, { key: 'ArrowRight' })

    expect(onReorder).toHaveBeenCalledWith(['b', 'a'])
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Moved A to position 2 of 2'))
  })
})
