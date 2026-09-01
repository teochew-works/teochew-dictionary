import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DeckTray } from './DeckTray'
import type { DeckStats } from '../decks/stats'
import type { Deck } from '@teochew/core'

const decks: Deck[] = [
  { id: 'dictionary', name: 'Dictionary', hue: 'blue', kind: 'virtual', cards: ['a', 'b'] },
  { id: 'd1', name: 'Core 100', hue: 'teal', kind: 'user', cards: ['a'] },
]
const stats = new Map<string, DeckStats>([
  ['dictionary', { total: 2, kept: 2, due: 0, fresh: 2, learned: 0 }],
  ['d1', { total: 1, kept: 1, due: 1, fresh: 0, learned: 0 }],
])

function setup(overrides: Partial<Parameters<typeof DeckTray>[0]> = {}) {
  const props = {
    inPlayDecks: decks,
    statsById: stats,
    totals: { pool: 2, due: 1, fresh: 1, learned: 0 },
    trayRef: vi.fn(),
    itemRef: () => vi.fn(),
    isOver: false,
    caretIndex: null,
    isDragging: () => false,
    isLifted: () => false,
    cardDropFor: () => null,
    onRemove: vi.fn(),
    onPointerDown: () => vi.fn(),
    onKeyDown: vi.fn(),
    ...overrides,
  }
  const view = render(<DeckTray {...props} />)
  return { ...view, props }
}

describe('DeckTray', () => {
  it('adds up what the whole table contributes', () => {
    const { container } = setup()
    // Scoped to the totals line: the per-deck chips carry their own due/new counts.
    const totals = within(container.querySelector('.table__totals') as HTMLElement)
    expect(totals.getByText('2')).toBeInTheDocument()
    expect(totals.getByText('cards from 2 decks')).toBeInTheDocument()
    expect(totals.getByText('1 due')).toBeInTheDocument()
    expect(totals.getByText('1 new')).toBeInTheDocument()
    expect(totals.getByText('0 learned')).toBeInTheDocument()
  })

  it('says "1 deck" rather than "1 decks"', () => {
    setup({ inPlayDecks: [decks[0]!] })
    expect(screen.getByText('cards from 1 deck')).toBeInTheDocument()
  })

  it('shows each in-play deck as a chip', () => {
    setup()
    expect(screen.getByText('Core 100')).toBeInTheDocument()
    expect(screen.getByText('Dictionary')).toBeInTheDocument()
  })

  it('is still a drop zone with an invitation when nothing is in play', () => {
    const { container } = setup({ inPlayDecks: [], totals: { pool: 0, due: 0, fresh: 0, learned: 0 } })
    expect(screen.getByText('Nothing in play')).toBeInTheDocument()
    expect(screen.getByText('Drag decks here to practise them together')).toBeInTheDocument()
    expect(container.querySelector('.tray.is-empty')).not.toBeNull()
  })

  it('lights the whole zone while a deck is over it', () => {
    const { container } = setup({ isOver: true })
    expect(container.querySelector('.tray.is-over')).not.toBeNull()
  })

  it('shows a caret where the deck would land', () => {
    const { container } = setup({ caretIndex: 1 })
    const children = [...(container.querySelector('.tray')?.children ?? [])]
    const caretAt = children.findIndex((c) => c.classList.contains('caret'))
    const chipsBefore = children.slice(0, caretAt).filter((c) => c.classList.contains('chip')).length
    expect(chipsBefore).toBe(1)
  })

  it('puts the caret past the last chip when dropping at the end', () => {
    const { container } = setup({ caretIndex: 2 })
    const children = [...(container.querySelector('.tray')?.children ?? [])]
    expect(children[children.length - 1]).toHaveClass('caret')
  })

  it('takes a deck off the table from its chip', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Take Core 100 off the table' }))
    expect(props.onRemove).toHaveBeenCalledWith('d1')
  })

  it('renders the saved-group row it is given', () => {
    render(
      <DeckTray
        {...{
          inPlayDecks: decks,
          statsById: stats,
          totals: { pool: 2, due: 1, fresh: 1, learned: 0 },
          trayRef: vi.fn(),
          itemRef: () => vi.fn(),
          isOver: false,
          caretIndex: null,
          isDragging: () => false,
          isLifted: () => false,
          cardDropFor: () => null,
          onRemove: vi.fn(),
          onPointerDown: () => vi.fn(),
          onKeyDown: vi.fn(),
        }}
      >
        <p>groups go here</p>
      </DeckTray>,
    )
    expect(screen.getByText('groups go here')).toBeInTheDocument()
  })

  /*
   * The tray's open/closed state only visibly matters at phone width
   * (mobile.md §3.4 — the tray collapses to a one-line summary there); this
   * pins the toggle itself, which is width-independent.
   */
  it('toggles the tray-open state from its own summary line', () => {
    const { container } = setup()
    const head = screen.getByRole('button', { name: /On the table/ })
    const initiallyOpen = head.getAttribute('aria-expanded') === 'true'

    fireEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', String(!initiallyOpen))
    expect(container.querySelector('.table--tray-open') !== null).toBe(!initiallyOpen)

    fireEvent.click(head)
    expect(head).toHaveAttribute('aria-expanded', String(initiallyOpen))
  })
})
