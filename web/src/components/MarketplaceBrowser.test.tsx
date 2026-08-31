import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MarketplaceBrowser } from './MarketplaceBrowser'
import type { StarterDeckCatalogEntry } from '../types/starter-decks'

const CATALOG: StarterDeckCatalogEntry[] = [
  { id: 'animals', name: 'Animals', cards: ['a', 'b', 'c'] },
  { id: 'numbers', name: 'Numbers & Counting', cards: ['x', 'y'] },
]

function setup(overrides: Partial<Parameters<typeof MarketplaceBrowser>[0]> = {}) {
  const onInstall = vi.fn()
  const props = {
    decks: CATALOG,
    loading: false,
    error: null,
    deckDrag: { onPointerDown: vi.fn(() => vi.fn()), isDragging: vi.fn(() => false) },
    onInstall,
    ...overrides,
  }
  const view = render(<MarketplaceBrowser {...props} />)
  return { ...view, props, onInstall }
}

function row(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name},`) })
}

describe('MarketplaceBrowser', () => {
  it('lists every catalog deck with its word count', () => {
    setup()
    expect(screen.getByText('Animals')).toBeInTheDocument()
    expect(screen.getByText('3 words')).toBeInTheDocument()
    expect(screen.getByText('Numbers & Counting')).toBeInTheDocument()
    expect(screen.getByText('2 words')).toBeInTheDocument()
  })

  it('installs on a click, without needing a drag', () => {
    const { onInstall } = setup()
    fireEvent.click(row('Numbers & Counting'))
    expect(onInstall).toHaveBeenCalledWith(CATALOG[1])
  })

  it('installs on Enter or Space from the keyboard', () => {
    const { onInstall } = setup()
    fireEvent.keyDown(row('Animals'), { key: 'Enter' })
    expect(onInstall).toHaveBeenCalledWith(CATALOG[0])

    onInstall.mockClear()
    fireEvent.keyDown(row('Animals'), { key: ' ' })
    expect(onInstall).toHaveBeenCalledWith(CATALOG[0])
  })

  it('wires each row as a drag source', () => {
    const { props } = setup()
    fireEvent.pointerDown(row('Animals'))
    expect(props.deckDrag.onPointerDown).toHaveBeenCalledWith('animals')
  })

  it('marks the row being dragged', () => {
    setup({ deckDrag: { onPointerDown: vi.fn(() => vi.fn()), isDragging: (id: string) => id === 'animals' } })
    expect(row('Animals').className).toContain('is-source')
    expect(row('Numbers & Counting').className).not.toContain('is-source')
  })

  it('shows a loading note instead of the list while loading', () => {
    setup({ loading: true })
    expect(screen.getByText('Loading starter decks…')).toBeInTheDocument()
    expect(screen.queryByText('Animals')).not.toBeInTheDocument()
  })

  it('shows an error note instead of the list on failure', () => {
    setup({ error: 'fetch failed: 404 Not Found' })
    expect(screen.getByText(/Couldn't load the marketplace catalog/)).toBeInTheDocument()
    expect(screen.queryByText('Animals')).not.toBeInTheDocument()
  })
})
