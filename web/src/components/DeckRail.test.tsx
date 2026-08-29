import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DeckRail } from './DeckRail'
import type { DeckStats } from '../decks/stats'
import type { Deck } from '../decks/types'

const dictionaryDeck: Deck = { id: 'dictionary', name: 'Dictionary', hue: 'blue', kind: 'virtual', cards: ['a', 'b'] }
const userDecks: Deck[] = [
  { id: 'd1', name: 'Food words', hue: 'red', kind: 'user', cards: ['a'] },
  { id: 'd2', name: 'Travel', hue: 'orange', kind: 'user', cards: [] },
]
const statsById = new Map<string, DeckStats>([
  ['dictionary', { total: 2, kept: 2, due: 0, fresh: 2, learned: 0 }],
  ['d1', { total: 1, kept: 1, due: 1, fresh: 0, learned: 0 }],
  ['d2', { total: 0, kept: 0, due: 0, fresh: 0, learned: 0 }],
])

const menuActions = { onPutOnTable: vi.fn(), onViewCards: vi.fn(), onRename: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() }

function setup(overrides: Partial<Parameters<typeof DeckRail>[0]> = {}) {
  const props = {
    dictionaryDeck,
    userDecks,
    statsById,
    inPlayIds: ['dictionary'],
    libraryRef: vi.fn(),
    trashRef: vi.fn(),
    itemRef: () => vi.fn(),
    dictionaryRef: vi.fn(),
    caretIndex: null,
    libraryOver: false,
    trashArmed: false,
    trashOver: false,
    trashLabel: 'Release to delete deck',
    isDragging: () => false,
    isLifted: () => false,
    cardDropFor: () => null,
    renaming: null,
    menuActionsFor: () => menuActions,
    onPointerDown: () => vi.fn(),
    onKeyDown: vi.fn(),
    onRenameRequest: vi.fn(),
    onCreateDeck: vi.fn(),
    ...overrides,
  }
  const view = render(<DeckRail {...props} />)
  return { ...view, props }
}

describe('DeckRail', () => {
  it('separates the read-only dictionary from the user decks', () => {
    setup()
    expect(screen.getByText('Reference')).toBeInTheDocument()
    expect(screen.getByText('My decks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Dictionary,/ })).toBeInTheDocument()
  })

  it('lists every user deck', () => {
    setup()
    expect(screen.getByRole('button', { name: /^Food words,/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Travel,/ })).toBeInTheDocument()
  })

  it('gives the dictionary no options menu, since there is nothing to do to it', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Options for Dictionary' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Options for Food words' })).toBeInTheDocument()
  })

  it('invites a first deck when the library is empty', () => {
    setup({ userDecks: [] })
    expect(screen.getByText(/No decks yet/)).toBeInTheDocument()
  })

  it('creates a deck from the section header', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(props.onCreateDeck).toHaveBeenCalled()
  })

  it('explains the keyboard path alongside the drag one', () => {
    setup()
    expect(screen.getByText(/Drag a deck onto the table/)).toBeInTheDocument()
    expect(screen.getAllByText('Space', { selector: 'kbd' })).toHaveLength(2)
  })

  describe('the rail toggle', () => {
    it('starts open', () => {
      const { container } = setup()
      expect(container.querySelector('.rail--closed')).toBeNull()
      expect(screen.getByRole('button', { name: 'Collapse the deck library' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('collapses and re-expands', () => {
      const { container } = setup()
      fireEvent.click(screen.getByRole('button', { name: 'Collapse the deck library' }))
      expect(container.querySelector('.rail--closed')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Expand the deck library' }))
      expect(container.querySelector('.rail--closed')).toBeNull()
    })
  })

  describe('the trash', () => {
    it('is hidden from assistive tech until a deck is in the air', () => {
      const { container } = setup()
      expect(container.querySelector('.trash')).toHaveAttribute('aria-hidden', 'true')
      expect(container.querySelector('.trash--armed')).toBeNull()
    })

    it('materialises while a deck is being dragged', () => {
      const { container } = setup({ trashArmed: true })
      expect(container.querySelector('.trash--armed')).not.toBeNull()
      expect(container.querySelector('.trash')).toHaveAttribute('aria-hidden', 'false')
    })

    it('reacts when the deck is over it', () => {
      const { container } = setup({ trashArmed: true, trashOver: true })
      expect(container.querySelector('.trash.is-over')).not.toBeNull()
    })

    it('says what releasing would do, which is not always deleting a deck', () => {
      setup({ trashArmed: true, trashLabel: 'Release to remove from Kitchen' })
      expect(screen.getByText('Release to remove from Kitchen')).toBeInTheDocument()
    })
  })

  it('shows a caret where a dragged deck would land in the library', () => {
    const { container } = setup({ caretIndex: 1 })
    const list = container.querySelectorAll('.rail__list')[1] as HTMLElement
    const children = [...list.children]
    const caretAt = children.findIndex((c) => c.classList.contains('caret'))
    expect(children.slice(0, caretAt).filter((c) => c.classList.contains('deck'))).toHaveLength(1)
  })

  it('lights the library when a card is dropped there to start a deck', () => {
    const { container } = setup({ libraryOver: true })
    expect(container.querySelector('.rail__list--over')).not.toBeNull()
  })

  it('renames in place, on the deck being renamed only', () => {
    const renaming = { deckId: 'd2', value: 'Trips', onChange: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() }
    setup({ renaming })
    expect(screen.getByLabelText('New name for Travel')).toHaveValue('Trips')
    expect(screen.queryByLabelText('New name for Food words')).not.toBeInTheDocument()
  })

  it('offers rename from a deck double-click', () => {
    const { props } = setup()
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Travel,/ }))
    expect(props.onRenameRequest).toHaveBeenCalledWith(userDecks[1])
  })

  it('marks the decks already on the table', () => {
    const { container } = setup({ inPlayIds: ['dictionary', 'd1'] })
    const railLists = container.querySelectorAll('.rail__list')
    expect(within(railLists[1] as HTMLElement).getAllByText('on the table')).toHaveLength(1)
  })
})
