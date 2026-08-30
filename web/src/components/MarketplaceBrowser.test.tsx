import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MarketplaceBrowser } from './MarketplaceBrowser'
import type { StarterDeckCatalogEntry } from '../types/starter-decks'

const CATALOG: StarterDeckCatalogEntry[] = [
  { id: 'animals', name: 'Animals', cards: ['a', 'b', 'c'] },
  { id: 'numbers', name: 'Numbers & Counting', cards: ['x', 'y'] },
]

function setup(overrides: Partial<Parameters<typeof MarketplaceBrowser>[0]> = {}) {
  const props = {
    decks: CATALOG,
    loading: false,
    error: null,
    onInstall: vi.fn(),
    ...overrides,
  }
  const view = render(<MarketplaceBrowser {...props} />)
  return { ...view, props }
}

describe('MarketplaceBrowser', () => {
  it('lists every catalog deck with its word count', () => {
    setup()
    expect(screen.getByText('Animals')).toBeInTheDocument()
    expect(screen.getByText('3 words')).toBeInTheDocument()
    expect(screen.getByText('Numbers & Counting')).toBeInTheDocument()
    expect(screen.getByText('2 words')).toBeInTheDocument()
  })

  it('fires onInstall with the right catalog deck', () => {
    const { props } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: 'Install' })[1]!)
    expect(props.onInstall).toHaveBeenCalledWith(CATALOG[1])
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
