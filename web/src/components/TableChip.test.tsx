import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TableChip } from './TableChip'
import type { DeckStats } from '../decks/stats'
import type { Deck } from '../decks/types'

const deck: Deck = { id: 'd1', name: 'Core 100', hue: 'teal', kind: 'user', cards: ['a', 'b', 'c'] }
const stats: DeckStats = { total: 3, kept: 3, due: 2, fresh: 1, learned: 0 }

function setup(overrides: Partial<Parameters<typeof TableChip>[0]> = {}) {
  const props = {
    deck,
    stats,
    elementRef: vi.fn(),
    dragging: false,
    lifted: false,
    cardDrop: null,
    onRemove: vi.fn(),
    onPointerDown: vi.fn(),
    onKeyDown: vi.fn(),
    ...overrides,
  }
  const view = render(<TableChip {...props} />)
  return { ...view, props }
}

describe('TableChip', () => {
  it('shows what the session drew from this deck', () => {
    setup()
    expect(screen.getByText('Core 100')).toBeInTheDocument()
    expect(screen.getByText('2 due')).toBeInTheDocument()
    expect(screen.getByText('1 new')).toBeInTheDocument()
  })

  it('says the whole deck is in play when the filters cut nothing', () => {
    setup()
    expect(screen.getByText('all in play')).toBeInTheDocument()
  })

  it('names the surviving fraction when the filters bit', () => {
    setup({ stats: { ...stats, kept: 1 } })
    expect(screen.getByText('1 of 3 pass filters')).toBeInTheDocument()
  })

  it('carries the slice into its accessible name', () => {
    setup({ stats: { ...stats, kept: 1 } })
    expect(screen.getByRole('button', { name: 'Core 100 on the table, 1 of 3 pass filters' })).toBeInTheDocument()
  })

  it('takes the deck off the table from its own close button', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Take Core 100 off the table' }))
    expect(props.onRemove).toHaveBeenCalled()
  })

  it('starts a drag from the chip body', () => {
    const { props } = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: /on the table/ }), { button: 0 })
    expect(props.onPointerDown).toHaveBeenCalled()
  })

  it('does not start a drag from the close button', () => {
    const { props } = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Take Core 100 off the table' }), { button: 0 })
    expect(props.onPointerDown).not.toHaveBeenCalled()
  })

  it('registers itself through the one composed ref it is given', () => {
    const elementRef = vi.fn()
    setup({ elementRef })
    expect(elementRef).toHaveBeenCalledWith(expect.any(HTMLElement))
  })
})
