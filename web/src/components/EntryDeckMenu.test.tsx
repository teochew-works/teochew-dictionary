import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EntryDeckMenu } from './EntryDeckMenu'
import type { Deck } from '../decks/types'

const decks: Deck[] = [
  { id: 'd1', name: 'Food words', hue: 'red', kind: 'user', cards: [] },
  { id: 'd2', name: 'Travel', hue: 'orange', kind: 'user', cards: ['e1'] },
]

function setup(overrides: Partial<Parameters<typeof EntryDeckMenu>[0]> = {}) {
  const props = {
    headword: '茶',
    entryId: 'e1',
    userDecks: decks,
    anchorRef: createRef<HTMLElement>(),
    onAddCard: vi.fn(),
    onRemoveCard: vi.fn(),
    onNewDeck: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<EntryDeckMenu {...props} />)
  return props
}

describe('EntryDeckMenu', () => {
  it('presents each deck as a membership toggle, not a command', () => {
    setup()
    expect(screen.getByRole('menuitemcheckbox', { name: /Food words/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('menuitemcheckbox', { name: /Travel/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('leaves a deck that already holds the card usable, so it can be untoggled', () => {
    setup()
    expect(screen.getByRole('menuitemcheckbox', { name: /Travel/ })).toBeEnabled()
  })

  it('files the card into an unticked deck', () => {
    const { onAddCard } = setup()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Food words/ }))
    expect(onAddCard).toHaveBeenCalledWith('d1')
  })

  it('takes the card back out of a ticked deck', () => {
    const { onRemoveCard } = setup()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Travel/ }))
    expect(onRemoveCard).toHaveBeenCalledWith('d2')
  })

  it('stays open through a toggle, since it edits membership across several decks', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Food words/ }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers starting a new deck, and closes after it', () => {
    const { onNewDeck, onClose } = setup()
    fireEvent.click(screen.getByRole('menuitem', { name: '+ New deck with this card' }))
    expect(onNewDeck).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('says so when there are no decks yet', () => {
    setup({ userDecks: [] })
    expect(screen.getByText('No decks yet.')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '+ New deck with this card' })).toBeInTheDocument()
  })

  it('renders outside its caller, so no scrolling or faded ancestor can swallow it', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const { container } = render(
      <EntryDeckMenu
        headword="茶"
        entryId="e1"
        userDecks={decks}
        anchorRef={createRef<HTMLElement>()}
        onAddCard={vi.fn()}
        onRemoveCard={vi.fn()}
        onNewDeck={vi.fn()}
        onClose={vi.fn()}
      />,
      { container: host },
    )
    expect(container.querySelector('.entry-deck-menu')).toBeNull()
    expect(document.body.querySelector('.entry-deck-menu')).not.toBeNull()
  })

  it('closes on Escape', () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
