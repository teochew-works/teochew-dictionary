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

  it('creates a deck via the inline input', () => {
    const onCreateDeck = vi.fn()
    renderRail({ onCreateDeck })

    fireEvent.click(screen.getByText('+ New deck'))
    const input = screen.getByLabelText('New deck name')
    fireEvent.change(input, { target: { value: 'Kitchen vocab' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreateDeck).toHaveBeenCalledWith('Kitchen vocab')
    expect(screen.queryByLabelText('New deck name')).not.toBeInTheDocument()
  })

  it('does not create a deck when the input is cancelled or blank', () => {
    const onCreateDeck = vi.fn()
    renderRail({ onCreateDeck })

    fireEvent.click(screen.getByText('+ New deck'))
    fireEvent.keyDown(screen.getByLabelText('New deck name'), { key: 'Escape' })
    expect(onCreateDeck).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('New deck name')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('+ New deck'))
    const input = screen.getByLabelText('New deck name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
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

  it('deletes a deck after confirming via DeleteConfirm', () => {
    const onDeleteDeck = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], onDeleteDeck })

    fireEvent.click(screen.getByLabelText('Delete A'))
    fireEvent.click(screen.getByLabelText('Confirm deleting A'))

    expect(onDeleteDeck).toHaveBeenCalledWith('a')
  })

  it('does not delete a deck when the confirmation is cancelled', () => {
    const onDeleteDeck = vi.fn()
    renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], onDeleteDeck })

    fireEvent.click(screen.getByLabelText('Delete A'))
    fireEvent.click(screen.getByText('Cancel'))

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

  describe('crossListDrop (issue #189)', () => {
    function stubDropZone() {
      return {
        containerRect: () => ({ top: 100, bottom: 150, left: 0, right: 200 }),
        items: () => [],
      }
    }

    it('drops a dragged deck onto the cross-list target and announces the move', () => {
      const onMove = vi.fn()
      const announce = vi.fn()
      renderRail({
        userDecks: [deck({ id: 'a', name: 'A' })],
        announce,
        crossListDrop: { dropZone: stubDropZone(), zoneLabel: 'the table', onMove },
      })

      const handle = screen.getByLabelText('Reorder A')
      fireEvent.pointerDown(handle, { button: 0 })
      fireEvent(document, new PointerEvent('pointerup', { clientX: 100, clientY: 125 }))

      expect(onMove).toHaveBeenCalledWith('a', 0)
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('Moved A to the table'))
    })

    it('does not treat a drop outside both the rail and the cross-list target as a move', () => {
      const onMove = vi.fn()
      renderRail({
        userDecks: [deck({ id: 'a', name: 'A' })],
        crossListDrop: { dropZone: stubDropZone(), zoneLabel: 'the table', onMove },
      })

      const handle = screen.getByLabelText('Reorder A')
      fireEvent.pointerDown(handle, { button: 0 })
      fireEvent(document, new PointerEvent('pointerup', { clientX: 9999, clientY: 9999 }))

      expect(onMove).not.toHaveBeenCalled()
    })

    it('moves a grabbed deck to the cross-list target via the keyboard, with no index', () => {
      const onMove = vi.fn()
      const announce = vi.fn()
      renderRail({
        userDecks: [deck({ id: 'a', name: 'A' })],
        announce,
        crossListDrop: { dropZone: stubDropZone(), zoneLabel: 'the table', onMove },
      })

      const handle = screen.getByLabelText('Reorder A')
      fireEvent.keyDown(handle, { key: ' ' })
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('t to move to the table'))

      fireEvent.keyDown(handle, { key: 't' })

      expect(onMove).toHaveBeenCalledWith('a')
      expect(announce).toHaveBeenCalledWith('Moved A to the table.')
    })

    it('does not offer the cross-list move hint when crossListDrop is not given', () => {
      const announce = vi.fn()
      renderRail({ userDecks: [deck({ id: 'a', name: 'A' })], announce })

      fireEvent.keyDown(screen.getByLabelText('Reorder A'), { key: ' ' })

      expect(announce).toHaveBeenCalledWith('Picked up A. Use arrow keys to move, space to drop, escape to cancel.')
    })
  })
})
