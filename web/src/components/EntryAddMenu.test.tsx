import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EntryAddMenu } from './EntryAddMenu'
import type { Deck } from '../decks/types'

const decks: Deck[] = [
  { id: 'd1', name: 'Food words', hue: 'red', kind: 'user', cards: [] },
  { id: 'd2', name: 'Travel', hue: 'orange', kind: 'user', cards: ['e1'] },
]

function setup() {
  const onAddCard = vi.fn()
  const onNewDeck = vi.fn()
  const onClose = vi.fn()
  render(
    <EntryAddMenu headword="茶" entryId="e1" userDecks={decks} onAddCard={onAddCard} onNewDeck={onNewDeck} onClose={onClose} />,
  )
  return { onAddCard, onNewDeck, onClose }
}

describe('EntryAddMenu', () => {
  it('lists every deck the entry could go into', () => {
    setup()
    expect(screen.getByRole('menuitem', { name: 'Food words' })).toBeEnabled()
  })

  it('ticks and disables a deck that already holds the entry', () => {
    setup()
    const already = screen.getByRole('menuitem', { name: /Travel/ })
    expect(already).toBeDisabled()
    expect(already).toHaveTextContent('✓')
  })

  it('files the entry and closes', () => {
    const { onAddCard, onClose } = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Food words' }))
    expect(onAddCard).toHaveBeenCalledWith('d1')
    expect(onClose).toHaveBeenCalled()
  })

  it('offers starting a new deck from the entry', () => {
    const { onNewDeck } = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: '+ New deck with this card' }))
    expect(onNewDeck).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
