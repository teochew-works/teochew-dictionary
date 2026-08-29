import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrowseDrawer } from './BrowseDrawer'
import { makeEntry, makeReading } from '../test/entryFixtures'
import type { AudioReference } from '../types/dict'
import type { Deck } from '../decks/types'

const CLIP: AudioReference = {
  key: 'dio5',
  url: 'https://example.com/dio5.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: [],
}

const TEA = makeEntry({
  id: 'de5-茶',
  headword: '茶',
  level: 'A1',
  readings: [makeReading({ pengim: 'dê5', sandhi: 'dê7', wordAudio: CLIP })],
  senses: [{ pos: 'noun', gloss_en: ['tea'] }],
  search_keys: ['茶', 'de5', 'tea'],
})
const RICE = makeEntry({
  id: 'bng7-飯',
  headword: '飯',
  readings: [makeReading({ pengim: 'bng7', sandhi: 'bng7' })],
  senses: [{ pos: 'noun', gloss_en: ['rice'] }],
  search_keys: ['飯', 'bng7', 'rice'],
})

const decks: Deck[] = [{ id: 'd1', name: 'Food words', hue: 'red', kind: 'user', cards: [] }]

function setup(overrides: Partial<Parameters<typeof BrowseDrawer>[0]> = {}) {
  const props = {
    open: true,
    entries: [TEA, RICE],
    userDecks: decks,
    pronunciation: 'citation' as const,
    poolSize: 12,
    cardDrag: { onPointerDown: () => vi.fn(), isDragging: () => false },
    onAddCard: vi.fn(),
    onRemoveCard: vi.fn(),
    onNewDeckFromCard: vi.fn(),
    onSavePoolAsDeck: vi.fn(),
    ...overrides,
  }
  const view = render(<BrowseDrawer {...props} />)
  return { ...view, props }
}

function searchFor(query: string) {
  fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: query } })
}

describe('BrowseDrawer', () => {
  it('is collapsed and hidden from assistive tech while closed', () => {
    const { container } = setup({ open: false })
    expect(container.querySelector('.drawer--open')).toBeNull()
    expect(container.querySelector('.drawer')).toHaveAttribute('aria-hidden', 'true')
  })

  it('waits for a query rather than listing 16,000 entries', () => {
    setup()
    expect(screen.getByText('Type to search for entries to add.')).toBeInTheDocument()
    expect(screen.queryByText('茶')).not.toBeInTheDocument()
  })

  it('lists matches with their reading, gloss, and tags', () => {
    setup()
    searchFor('tea')
    expect(screen.getByText('茶')).toBeInTheDocument()
    expect(screen.getByText('dê5')).toBeInTheDocument()
    expect(screen.getByText('tea')).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('audio')).toBeInTheDocument()
  })

  it('follows the sandhi setting in the reading it shows', () => {
    setup({ pronunciation: 'sandhi' })
    searchFor('tea')
    expect(screen.getByText('dê7')).toBeInTheDocument()
  })

  it('says so when nothing matches', () => {
    setup()
    searchFor('zzzz')
    expect(screen.getByText(/No entries match/)).toBeInTheDocument()
  })

  it('points at the library when there is nowhere to file yet', () => {
    setup({ userDecks: [] })
    expect(screen.getByText(/Create a deck first/)).toBeInTheDocument()
  })

  it('opens a deck menu when an entry is clicked, for the non-drag path', () => {
    setup()
    searchFor('tea')
    fireEvent.click(screen.getByRole('button', { name: /茶/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitemcheckbox', { name: /Food words/ })).toBeInTheDocument()
  })

  it('opens the same menu from the keyboard', () => {
    setup()
    searchFor('tea')
    fireEvent.keyDown(screen.getByRole('button', { name: /茶/ }), { key: 'Enter' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('files the entry through that menu', () => {
    const { props } = setup()
    searchFor('tea')
    fireEvent.click(screen.getByRole('button', { name: /茶/ }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Food words/ }))
    expect(props.onAddCard).toHaveBeenCalledWith('d1', 'de5-茶')
  })

  it('takes an entry back out of a deck that holds it', () => {
    const decksWithCard = [{ ...decks[0]!, cards: ['de5-茶'] }]
    const { props } = setup({ userDecks: decksWithCard })
    searchFor('tea')
    fireEvent.click(screen.getByRole('button', { name: /茶/ }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Food words/ }))
    expect(props.onRemoveCard).toHaveBeenCalledWith('d1', 'de5-茶')
  })

  it('starts a new deck from an entry', () => {
    const { props } = setup()
    searchFor('tea')
    fireEvent.click(screen.getByRole('button', { name: /茶/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: '+ New deck with this card' }))
    expect(props.onNewDeckFromCard).toHaveBeenCalledWith('de5-茶')
  })

  it('saves the filtered review pool as its own deck', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Save this pool as a deck' }))
    expect(props.onSavePoolAsDeck).toHaveBeenCalled()
  })

  it('cannot save an empty pool', () => {
    setup({ poolSize: 0 })
    expect(screen.getByRole('button', { name: 'Save this pool as a deck' })).toBeDisabled()
  })

  it('marks the entry being dragged as the source', () => {
    const { container } = setup({ cardDrag: { onPointerDown: () => vi.fn(), isDragging: (id: string) => id === 'de5-茶' } })
    searchFor('tea')
    expect(container.querySelector('.entry.is-source')).not.toBeNull()
  })
})
