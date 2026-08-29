import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckCard } from './DeckCard'
import type { DeckStats } from '../decks/stats'
import type { Deck } from '../decks/types'

const deck: Deck = { id: 'd1', name: 'Food words', hue: 'red', kind: 'user', cards: ['a', 'b', 'c'] }
const dictionary: Deck = { id: 'dictionary', name: 'Dictionary', hue: 'blue', kind: 'virtual', cards: ['a', 'b'] }
const stats: DeckStats = { total: 3, kept: 3, due: 2, fresh: 1, learned: 0 }

const menuActions = { onPutOnTable: vi.fn(), onRename: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() }

function setup(overrides: Partial<Parameters<typeof DeckCard>[0]> = {}) {
  const props = {
    deck,
    stats,
    inPlay: false,
    elementRef: vi.fn(),
    dragging: false,
    lifted: false,
    cardDrop: null,
    renaming: null,
    menuActions,
    onPointerDown: vi.fn(),
    onKeyDown: vi.fn(),
    onRenameRequest: vi.fn(),
    ...overrides,
  }
  const view = render(<DeckCard {...props} />)
  return { ...view, props }
}

describe('DeckCard', () => {
  it('shows the deck name and how big it is', () => {
    setup()
    expect(screen.getByText('Food words')).toBeInTheDocument()
    expect(screen.getByText('3 cards')).toBeInTheDocument()
  })

  it('says "card" for a deck of one', () => {
    setup({ deck: { ...deck, cards: ['a'] } })
    expect(screen.getByText('1 card')).toBeInTheDocument()
  })

  it('counts the dictionary in entries, not cards', () => {
    setup({ deck: dictionary, menuActions: null })
    expect(screen.getByText('2 entries')).toBeInTheDocument()
  })

  it('shows how much is due when the deck is in the library', () => {
    setup()
    expect(screen.getByText('2 due')).toBeInTheDocument()
  })

  it('replaces the due count with its status once the deck is on the table', () => {
    setup({ inPlay: true })
    expect(screen.getByText('on the table')).toBeInTheDocument()
    expect(screen.queryByText('2 due')).not.toBeInTheDocument()
  })

  it('says nothing about due when there is nothing due', () => {
    setup({ stats: { ...stats, due: 0 } })
    expect(screen.queryByText(/due/)).not.toBeInTheDocument()
  })

  it('describes itself for assistive tech, including where it is', () => {
    setup({ inPlay: true })
    expect(screen.getByRole('button', { name: 'Food words, 3 cards, on the table' })).toBeInTheDocument()
  })

  it('marks the dictionary as a deck that cannot be edited', () => {
    const { container } = setup({ deck: dictionary, menuActions: null })
    expect(container.querySelector('.deck--virtual')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Options/ })).not.toBeInTheDocument()
  })

  it('starts a drag from a press on the card itself', () => {
    const { props } = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Food words,/ }), { button: 0 })
    expect(props.onPointerDown).toHaveBeenCalled()
  })

  it('does not start a drag from a press on the options menu', () => {
    const { props } = setup()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Options for Food words' }), { button: 0 })
    expect(props.onPointerDown).not.toHaveBeenCalled()
  })

  it('offers rename on a double-click', () => {
    const { props } = setup()
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Food words,/ }))
    expect(props.onRenameRequest).toHaveBeenCalled()
  })

  it('does not offer rename on the dictionary', () => {
    const { props } = setup({ deck: dictionary, menuActions: null })
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Dictionary,/ }))
    expect(props.onRenameRequest).not.toHaveBeenCalled()
  })

  describe('while renaming', () => {
    const renaming = { value: 'Kitchen', onChange: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() }

    it('swaps the name for an input rather than opening a dialog', () => {
      setup({ renaming })
      expect(screen.getByLabelText('New name for Food words')).toHaveValue('Kitchen')
    })

    it('commits on Enter and on blur', () => {
      const onCommit = vi.fn()
      setup({ renaming: { ...renaming, onCommit } })
      const input = screen.getByLabelText('New name for Food words')
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.blur(input)
      expect(onCommit).toHaveBeenCalledTimes(2)
    })

    it('cancels on Escape', () => {
      const onCancel = vi.fn()
      setup({ renaming: { ...renaming, onCancel } })
      fireEvent.keyDown(screen.getByLabelText('New name for Food words'), { key: 'Escape' })
      expect(onCancel).toHaveBeenCalled()
    })

    it('keeps typing away from the lift shortcuts', () => {
      const onKeyDown = vi.fn()
      setup({ renaming, onKeyDown })
      fireEvent.keyDown(screen.getByLabelText('New name for Food words'), { key: ' ' })
      expect(onKeyDown).not.toHaveBeenCalled()
    })
  })

  it('reflects a card being dragged over it', () => {
    const { container: accept } = render(
      <DeckCard {...{ deck, stats, inPlay: false, elementRef: vi.fn(), dragging: false, lifted: false, cardDrop: 'accept' as const, renaming: null, menuActions, onPointerDown: vi.fn(), onKeyDown: vi.fn(), onRenameRequest: vi.fn() }} />,
    )
    expect(accept.querySelector('.drop-ok')).not.toBeNull()
  })

  it('reflects a card being refused', () => {
    const { container } = setup({ cardDrop: 'refuse' })
    expect(container.querySelector('.drop-no')).not.toBeNull()
  })

  it('leaves its slot as a placeholder while it is the one in the air', () => {
    const { container } = setup({ dragging: true })
    expect(container.querySelector('.is-source')).not.toBeNull()
  })

  it('shows it is held when lifted by keyboard', () => {
    const { container } = setup({ lifted: true })
    expect(container.querySelector('.kbd-lift')).not.toBeNull()
  })
})
