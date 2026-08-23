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
      examples: [
        { headword: '阿', pengim: 'a1', gloss: 'kinship prefix' },
        { headword: '鴉', pengim: 'a1', gloss: 'crow' },
      ],
    },
    {
      pengim: 'ai3',
      ipa: 'ai²¹³',
      examples: [{ headword: '愛', pengim: 'ai3', gloss: 'to want' }],
    },
    {
      pengim: 'bho5',
      ipa: 'bo⁵⁵',
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
})
