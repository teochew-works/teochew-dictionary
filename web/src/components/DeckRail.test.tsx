import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DeckRail } from './DeckRail'
import type { Deck } from '../decks/types'

const DICTIONARY: Deck = { id: 'dictionary', name: 'Dictionary', hue: 'blue', cards: ['a', 'b'], kind: 'virtual' }

function deck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user', ...overrides }
}

function renderRail(props: Partial<Parameters<typeof DeckRail>[0]> = {}) {
  return render(
    <DeckRail
      dictionaryDeck={DICTIONARY}
      userDecks={[]}
      inPlayIds={[]}
      onAddToTable={vi.fn()}
      onCreateDeck={vi.fn()}
      onRenameDeck={vi.fn()}
      onDeleteDeck={vi.fn()}
      onReorderDecks={vi.fn()}
      onOpenBrowseDrawer={vi.fn()}
      announce={vi.fn()}
      {...props}
    />,
  )
}

describe('DeckRail', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the dictionary deck marked read-only', () => {
    renderRail()
    expect(screen.getByText('Dictionary')).toBeInTheDocument()
    expect(screen.getByText('Read-only')).toBeInTheDocument()
  })

  it('offers to add the dictionary to the table only when it is not already in play', () => {
    const { rerender } = renderRail({ inPlayIds: [] })
    expect(screen.getByLabelText('Add Dictionary to the table')).toBeInTheDocument()

    rerender(
      <DeckRail
        dictionaryDeck={DICTIONARY}
        userDecks={[]}
        inPlayIds={['dictionary']}
        onAddToTable={vi.fn()}
        onCreateDeck={vi.fn()}
        onRenameDeck={vi.fn()}
        onDeleteDeck={vi.fn()}
        onReorderDecks={vi.fn()}
        onOpenBrowseDrawer={vi.fn()}
        announce={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Add Dictionary to the table')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no user decks', () => {
    renderRail({ userDecks: [] })
    expect(screen.getByText(/No decks yet/)).toBeInTheDocument()
  })

  it('lists every user deck', () => {
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' }), deck({ id: 'b', name: 'B' })] })
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('creates a deck from a window.prompt value', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Kitchen vocab')
    const onCreateDeck = vi.fn()
    renderRail({ onCreateDeck })

    fireEvent.click(screen.getByText('+ New deck'))

    expect(onCreateDeck).toHaveBeenCalledWith('Kitchen vocab')
  })

  it('does not create a deck when the prompt is cancelled or blank', () => {
    const onCreateDeck = vi.fn()
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    renderRail({ onCreateDeck })
    fireEvent.click(screen.getByText('+ New deck'))
    expect(onCreateDeck).not.toHaveBeenCalled()

    vi.spyOn(window, 'prompt').mockReturnValue('   ')
    fireEvent.click(screen.getByText('+ New deck'))
    expect(onCreateDeck).not.toHaveBeenCalled()
  })

  it('renames a deck via the inline input', () => {
    const onRenameDeck = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], onRenameDeck })

    fireEvent.click(screen.getByLabelText('Rename A'))
    const input = screen.getByLabelText('New name for A')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRenameDeck).toHaveBeenCalledWith('a', 'Renamed')
  })

  it('cancels a rename on Escape without calling onRenameDeck', () => {
    const onRenameDeck = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], onRenameDeck })

    fireEvent.click(screen.getByLabelText('Rename A'))
    const input = screen.getByLabelText('New name for A')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onRenameDeck).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('New name for A')).not.toBeInTheDocument()
  })

  it('deletes a deck after confirming', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onDeleteDeck = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], onDeleteDeck })

    fireEvent.click(screen.getByLabelText('Delete A'))

    expect(onDeleteDeck).toHaveBeenCalledWith('a')
  })

  it('does not delete a deck when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDeleteDeck = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], onDeleteDeck })

    fireEvent.click(screen.getByLabelText('Delete A'))

    expect(onDeleteDeck).not.toHaveBeenCalled()
  })

  it('adds a user deck to the table only when not already in play', () => {
    const onAddToTable = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], inPlayIds: [], onAddToTable })

    fireEvent.click(screen.getByLabelText('Add A to the table'))

    expect(onAddToTable).toHaveBeenCalledWith('a')
  })

  it('opens the browse drawer', () => {
    const onOpenBrowseDrawer = vi.fn()
    renderRail({ onOpenBrowseDrawer })

    fireEvent.click(screen.getByText('Browse dictionary…'))

    expect(onOpenBrowseDrawer).toHaveBeenCalledOnce()
  })

  it('reorders user decks via the keyboard', () => {
    const onReorderDecks = vi.fn()
    const announce = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' }), deck({ id: 'b', name: 'B' })], onReorderDecks, announce })

    const handle = screen.getByLabelText('Reorder A')
    fireEvent.keyDown(handle, { key: ' ' })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })

    expect(onReorderDecks).toHaveBeenCalledWith(['b', 'a'])
  })

  it('registers every row as a card-drop target when cardDrop is given', () => {
    const targetRef = vi.fn(() => vi.fn())
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], cardDrop: { targetRef, overId: null } })

    expect(targetRef).toHaveBeenCalledWith('dictionary')
    expect(targetRef).toHaveBeenCalledWith('a')
  })

  it('marks the dictionary row as refusing and a user deck row as accepting, based on overId', () => {
    const { container } = renderRail({
      userDecks: [deck({ id: 'a', name: 'A' })],
      cardDrop: { targetRef: () => vi.fn(), overId: 'dictionary' },
    })
    expect(container.querySelector('.deck-rail__row--refuse')).not.toBeNull()
    expect(container.querySelector('.deck-rail__row--accept')).toBeNull()
  })
})
