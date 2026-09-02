import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckContents } from './DeckContents'
import { makeEntry, makeReading } from '../test/entryFixtures'
import type { EnrichedEntry } from '@teochew/core'
import type { Deck } from '@teochew/core'

const TEA = makeEntry({
  id: 'e-tea',
  headword: '茶',
  readings: [makeReading({ pengim: 'dê5', sandhi: 'dê7' })],
  senses: [{ pos: 'noun', gloss_en: ['tea'] }],
})
const RICE = makeEntry({ id: 'e-rice', headword: '飯', senses: [{ pos: 'noun', gloss_en: ['rice'] }] })

const entryById = new Map<string, EnrichedEntry>([
  [TEA.id, TEA],
  [RICE.id, RICE],
])

const deck: Deck = { id: 'd1', name: 'Kitchen', hue: 'green', kind: 'user', cards: ['e-tea', 'e-rice'] }
const otherDeck: Deck = { id: 'd2', name: 'Travel', hue: 'orange', kind: 'user', cards: [] }

function setup(overrides: Partial<Parameters<typeof DeckContents>[0]> = {}) {
  const props = {
    deck,
    entryById,
    pronunciation: 'citation' as const,
    userDecks: [deck, otherDeck],
    cardDrag: {
      onPointerDown: () => vi.fn(),
      isDragging: () => false,
      listRef: vi.fn(),
      itemRef: () => vi.fn(),
      caretIndex: null,
      isOver: false,
    },
    lift: { isLifted: () => false, handleKeyDown: vi.fn() },
    onAddCard: vi.fn(),
    onRemoveCard: vi.fn(),
    onNewDeckFromCard: vi.fn(),
    onBrowseDictionary: vi.fn(),
    ...overrides,
  }
  const view = render(<DeckContents {...props} />)
  return { ...view, props }
}

describe('DeckContents', () => {
  it('names the deck and how much it holds', () => {
    setup()
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('2 cards')).toBeInTheDocument()
  })

  it('says "1 card" rather than "1 cards"', () => {
    setup({ deck: { ...deck, cards: ['e-tea'] } })
    expect(screen.getByText('1 card')).toBeInTheDocument()
  })

  it('lists the cards in the order the deck holds them', () => {
    const { container } = setup()
    expect([...container.querySelectorAll('.entry__hw')].map((e) => e.textContent)).toEqual(['茶', '飯'])
  })

  it('shows each card with its reading and gloss', () => {
    setup()
    expect(screen.getByText('dê5')).toBeInTheDocument()
    expect(screen.getByText('tea')).toBeInTheDocument()
  })

  it('follows the sandhi setting', () => {
    setup({ pronunciation: 'sandhi' })
    expect(screen.getByText('dê7')).toBeInTheDocument()
  })

  it('removes a card from the deck it is showing', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Remove 茶 from Kitchen' }))
    expect(props.onRemoveCard).toHaveBeenCalledWith('d1', 'e-tea')
  })

  it('does not start a drag from the remove button', () => {
    const onPointerDown = vi.fn()
    setup({
      cardDrag: {
        onPointerDown: () => onPointerDown,
        isDragging: () => false,
        listRef: vi.fn(),
        itemRef: () => vi.fn(),
        caretIndex: null,
        isOver: false,
      },
    })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Remove 茶 from Kitchen' }), { button: 0 })
    expect(onPointerDown).not.toHaveBeenCalled()
  })

  it('opens a membership menu from a row, so a card can be filed elsewhere without a drag', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /^茶/ }))
    expect(screen.getByRole('menu', { name: /Decks for 茶/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: /Travel/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('opens that menu from the keyboard too', () => {
    setup()
    fireEvent.keyDown(screen.getByRole('button', { name: /^茶/ }), { key: 'Enter' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('leaves space for the lift, so one row can both open a menu and be moved', () => {
    const lift = { isLifted: () => false, handleKeyDown: vi.fn() }
    setup({ lift })
    fireEvent.keyDown(screen.getByRole('button', { name: /^茶/ }), { key: ' ' })
    expect(lift.handleKeyDown).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('marks the row held by the keyboard', () => {
    const { container } = setup({ lift: { isLifted: (id: string) => id === 'e-tea', handleKeyDown: vi.fn() } })
    expect(container.querySelector('.entry.kbd-lift')).not.toBeNull()
  })

  it('shows a caret where a dropped card would land', () => {
    const { container } = setup({
      cardDrag: {
        onPointerDown: () => vi.fn(),
        isDragging: () => false,
        listRef: vi.fn(),
        itemRef: () => vi.fn(),
        caretIndex: 1,
        isOver: true,
      },
    })
    const children = [...(container.querySelector('.drawer__list')?.children ?? [])]
    const caretAt = children.findIndex((c) => c.classList.contains('caret'))
    expect(children.slice(0, caretAt).filter((c) => c.classList.contains('entry-wrap'))).toHaveLength(1)
    expect(container.querySelector('.drawer__list--over')).not.toBeNull()
  })

  it('registers itself as a drop zone, so cards can be dropped into the deck', () => {
    const listRef = vi.fn()
    setup({
      cardDrag: { onPointerDown: () => vi.fn(), isDragging: () => false, listRef, itemRef: () => vi.fn(), caretIndex: null, isOver: false },
    })
    expect(listRef).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('marks the row being dragged as the source', () => {
    const { container } = setup({
      cardDrag: {
        onPointerDown: () => vi.fn(),
        isDragging: (id: string) => id === 'e-tea',
        listRef: vi.fn(),
        itemRef: () => vi.fn(),
        caretIndex: null,
        isOver: false,
      },
    })
    expect(container.querySelector('.entry.is-source')).not.toBeNull()
  })

  it('invites cards when the deck is empty', () => {
    setup({ deck: { ...deck, cards: [] } })
    expect(screen.getByText(/This deck is empty/)).toBeInTheDocument()
  })

  it('switches to the dictionary rather than making you close the dock', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: '＋ Add cards' }))
    expect(props.onBrowseDictionary).toHaveBeenCalled()
  })

  describe('a card id that no longer resolves', () => {
    const stale: Deck = { ...deck, cards: ['e-tea', 'gone'] }

    it('shows it rather than hiding it, since hiding makes it unremovable', () => {
      setup({ deck: stale })
      expect(screen.getByText('No longer in the dictionary')).toBeInTheDocument()
      expect(screen.getByText('gone')).toBeInTheDocument()
    })

    it('offers the one thing that can be done with it', () => {
      const { props } = setup({ deck: stale })
      fireEvent.click(screen.getByRole('button', { name: 'Remove this missing card from Kitchen' }))
      expect(props.onRemoveCard).toHaveBeenCalledWith('d1', 'gone')
    })

    it('is not a drag source — there is nothing to file', () => {
      const { container } = setup({ deck: stale })
      const unresolved = container.querySelector('.entry--unresolved')
      expect(unresolved).not.toHaveAttribute('data-drag-source')
    })
  })
})
