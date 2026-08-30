import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App'
import type { Dict } from './types/dict'
import type { SoundsData } from './types/sounds'

const FIXTURE: Dict = {
  meta: { generated_from: 'data/', entry_count: 1, reading_count: 1, varieties: [], sources: [] },
  entries: [
    {
      id: 'dio5-ziu1-潮州',
      headword: '潮州',
      readings: [
        {
          pengim: 'dio5 ziu1',
          variety: 'chaozhou',
          ipa: 'tie⁵⁵ tsiu³³',
          poj: 'tiô-tsiu',
          sandhi: 'dio7 ziu1',
          ipa_confidence: 'medium',
          ipa_caveats: [],
          pengim_toneless: 'dio ziu',
          syllable_count: 2,
          audio: [null, null],
          sandhiAudio: [null, null],
          wordAudio: null,
        },
      ],
      senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
      sources: ['seed'],
      search_keys: ['潮州', 'dio5 ziu1', 'Chaozhou'],
      licence: 'CC-BY-4.0',
      attributions: [],
    },
  ],
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(FIXTURE), { status: 200 }))),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the dictionary and shows the entry in the Dictionary tab', async () => {
    render(<App />)
    expect(await screen.findByText('潮州')).toBeInTheDocument()
  })
})

describe('App with a hidden entry', () => {
  const FIXTURE_WITH_HIDDEN: Dict = {
    ...FIXTURE,
    entries: [...FIXTURE.entries, { ...FIXTURE.entries[0]!, id: 'hidden-entry', headword: '隱藏詞', hidden: true }],
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(FIXTURE_WITH_HIDDEN), { status: 200 }))),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not show entries flagged hidden', async () => {
    render(<App />)
    expect(await screen.findByText('潮州')).toBeInTheDocument()
    expect(screen.queryByText('隱藏詞')).not.toBeInTheDocument()
  })
})

describe('App Sounds tab', () => {
  const SOUNDS_FIXTURE: SoundsData = {
    variety: 'chaozhou',
    sounds: [
      {
        pengim: 'dio5',
        ipa: 'tie⁵⁵',
        initial: 'd',
        rime: 'io',
        tone: 5,
        occurrences: 1,
        examples: [{ headword: '潮', pengim: 'dio5', gloss: 'tide' }],
        clips: [],
      },
    ],
  }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        const body = url.includes('sounds.json') ? SOUNDS_FIXTURE : FIXTURE
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and shows the sound inventory only once the Sounds tab is selected', async () => {
    render(<App />)
    await screen.findByText('潮州')
    expect(screen.queryByText('tie⁵⁵')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Sounds' }))

    expect(await screen.findByText('tie⁵⁵')).toBeInTheDocument()
    expect(screen.getAllByText('dio5').length).toBeGreaterThan(0)
  })
})

describe('App dictionary entry routing (issue #194)', () => {
  beforeEach(() => {
    window.location.hash = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(FIXTURE), { status: 200 }))),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it('routes a selected entry through the hash and back again', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('潮州'))

    expect(window.location.hash).toBe(`#dictionary/${encodeURIComponent('dio5-ziu1-潮州')}`)
    expect(await screen.findByRole('heading', { name: '潮州' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Back to list/ }))

    expect(window.location.hash).toBe('#dictionary')
    await waitFor(() => expect(screen.queryByRole('heading', { name: '潮州' })).not.toBeInTheDocument())
  })

  it('opens directly to a deep-linked entry', async () => {
    window.location.hash = `#dictionary/${encodeURIComponent('dio5-ziu1-潮州')}`
    render(<App />)
    expect(await screen.findByRole('heading', { name: '潮州' })).toBeInTheDocument()
  })
})

describe('App Settings tab', () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(FIXTURE), { status: 200 }))),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows the Settings tab even before the dictionary has loaded', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('Show licensing info')).toBeInTheDocument()
  })
})
