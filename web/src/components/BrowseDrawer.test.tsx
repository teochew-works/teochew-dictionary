import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BrowseDrawer } from './BrowseDrawer'
import { makeEntry } from '../test/entryFixtures'
import type { Deck } from '../decks/types'

const KITCHEN: Deck = { id: 'kitchen', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }
const TRAVEL: Deck = { id: 'travel', name: 'Travel', hue: 'blue', cards: [], kind: 'user' }

describe('BrowseDrawer', () => {
  afterEach(() => {
    cleanup()
  })

  it('prompts to create a deck first when there are no user decks', () => {
    render(<BrowseDrawer entries={[]} userDecks={[]} onAddCard={vi.fn()} onRemoveCard={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Create a deck first/)).toBeInTheDocument()
  })

  it('prompts to search before showing any results', () => {
    const entry = makeEntry({ id: 'a', headword: '一' })
    render(<BrowseDrawer entries={[entry]} userDecks={[KITCHEN]} onAddCard={vi.fn()} onRemoveCard={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Type to search/)).toBeInTheDocument()
    expect(screen.queryByText('一')).not.toBeInTheDocument()
  })

  it('shows matching entries once a query is typed', () => {
    const entry = makeEntry({ id: 'a', headword: '一', search_keys: ['一', 'yi'] })
    render(<BrowseDrawer entries={[entry]} userDecks={[KITCHEN]} onAddCard={vi.fn()} onRemoveCard={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: '一' } })

    expect(screen.getByText('一')).toBeInTheDocument()
  })

  it('shows a no-matches message for a query with no hits', () => {
    const entry = makeEntry({ id: 'a', headword: '一', search_keys: ['一'] })
    render(<BrowseDrawer entries={[entry]} userDecks={[KITCHEN]} onAddCard={vi.fn()} onRemoveCard={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: 'zzzzz' } })

    expect(screen.getByText('No matches.')).toBeInTheDocument()
  })

  it('offers only decks the entry is not already in, in the add select', () => {
    const entry = makeEntry({ id: 'a', headword: '一', search_keys: ['一'] })
    render(
      <BrowseDrawer
        entries={[entry]}
        userDecks={[{ ...KITCHEN, cards: ['a'] }, TRAVEL]}
        onAddCard={vi.fn()}
        onRemoveCard={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: '一' } })

    const addSelect = screen.getByLabelText('Add 一 to a deck')
    expect(screen.queryByRole('option', { name: 'Kitchen' })).not.toBeInTheDocument()
    expect(addSelect).toBeInTheDocument()
  })

  it('calls onAddCard with the deck and entry id', () => {
    const entry = makeEntry({ id: 'a', headword: '一', search_keys: ['一'] })
    const onAddCard = vi.fn()
    render(<BrowseDrawer entries={[entry]} userDecks={[KITCHEN]} onAddCard={onAddCard} onRemoveCard={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: '一' } })

    fireEvent.change(screen.getByLabelText('Add 一 to a deck'), { target: { value: 'kitchen' } })

    expect(onAddCard).toHaveBeenCalledWith('kitchen', 'a')
  })

  it('shows a removable chip for each deck the entry already belongs to', () => {
    const entry = makeEntry({ id: 'a', headword: '一', search_keys: ['一'] })
    const onRemoveCard = vi.fn()
    render(
      <BrowseDrawer
        entries={[entry]}
        userDecks={[{ ...KITCHEN, cards: ['a'] }]}
        onAddCard={vi.fn()}
        onRemoveCard={onRemoveCard}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: '一' } })

    fireEvent.click(screen.getByLabelText('Remove 一 from Kitchen'))

    expect(onRemoveCard).toHaveBeenCalledWith('kitchen', 'a')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<BrowseDrawer entries={[]} userDecks={[]} onAddCard={vi.fn()} onRemoveCard={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<BrowseDrawer entries={[]} userDecks={[]} onAddCard={vi.fn()} onRemoveCard={vi.fn()} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })
})
