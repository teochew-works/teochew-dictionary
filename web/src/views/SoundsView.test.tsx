import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SoundsView } from './SoundsView'
import type { SoundsData } from '../types/sounds'

const FIXTURE: SoundsData = {
  variety: 'chaozhou',
  sounds: [
    {
      pengim: 'a1',
      ipa: 'a³³',
      occurrences: 5,
      examples: [
        { headword: '阿', pengim: 'a1', gloss: 'kinship prefix' },
        { headword: '鴉', pengim: 'a1', gloss: 'crow' },
      ],
    },
    {
      pengim: 'ai3',
      ipa: 'ai²¹³',
      occurrences: 20,
      examples: [{ headword: '愛', pengim: 'ai3', gloss: 'to want' }],
    },
    {
      pengim: 'bho5',
      ipa: 'bo⁵⁵',
      occurrences: 1,
      examples: [],
    },
  ],
}

function stubFetch(data: SoundsData) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))),
  )
}

describe('SoundsView', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the sound inventory and shows every sound with its examples', async () => {
    stubFetch(FIXTURE)
    render(<SoundsView />)

    expect(await screen.findByText('a³³')).toBeInTheDocument()
    expect(screen.getByText('阿')).toBeInTheDocument()
    expect(screen.getByText('鴉')).toBeInTheDocument()
    expect(screen.getByText('3 / 3 sounds')).toBeInTheDocument()
  })

  it('shows a fallback for a sound with no example yet', async () => {
    stubFetch(FIXTURE)
    render(<SoundsView />)

    expect(await screen.findByText('bho5')).toBeInTheDocument()
    expect(screen.getByText('no isolated example yet')).toBeInTheDocument()
  })

  it('filters by search query across pengim, IPA, and example text', async () => {
    stubFetch(FIXTURE)
    render(<SoundsView />)

    await screen.findByText('a³³')
    fireEvent.change(screen.getByLabelText('Search the sound inventory'), { target: { value: 'crow' } })

    expect(screen.getByText('a³³')).toBeInTheDocument()
    expect(screen.queryByText('ai²¹³')).not.toBeInTheDocument()
    expect(screen.queryByText('bho5')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 3 sounds')).toBeInTheDocument()
  })

  it('shows an error state when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))))
    render(<SoundsView />)

    expect(await screen.findByText(/couldn't load the sound inventory/i)).toBeInTheDocument()
  })

  it('switches to a flat, occurrence-ranked list and hides the alphabet nav when Frequency is selected', async () => {
    stubFetch(FIXTURE)
    const { container } = render(<SoundsView />)
    await screen.findByText('a³³')

    fireEvent.click(screen.getByRole('button', { name: 'Frequency' }))

    const pengims = [...container.querySelectorAll('.sound-row__pengim')].map((el) => el.textContent)
    expect(pengims).toEqual(['ai3', 'a1', 'bho5']) // descending by occurrences: 20, 5, 1
    expect(screen.queryByLabelText('Jump to initial')).not.toBeInTheDocument()

    const counts = [...container.querySelectorAll('.sound-row__count')].map((el) => el.textContent)
    expect(counts).toEqual(['20×', '5×', '1×'])
  })

  it('switching back to A–Z restores the grouped alphabetical view', async () => {
    stubFetch(FIXTURE)
    const { container } = render(<SoundsView />)
    await screen.findByText('a³³')

    fireEvent.click(screen.getByRole('button', { name: 'Frequency' }))
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }))

    expect(screen.getByLabelText('Jump to initial')).toBeInTheDocument()
    const pengims = [...container.querySelectorAll('.sound-row__pengim')].map((el) => el.textContent)
    expect(pengims).toEqual(['a1', 'ai3', 'bho5'])
  })
})
