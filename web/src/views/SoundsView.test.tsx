import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
      clips: [],
    },
    {
      pengim: 'ai3',
      ipa: 'ai²¹³',
      occurrences: 20,
      examples: [{ headword: '愛', pengim: 'ai3', gloss: 'to want' }],
      clips: [],
    },
    {
      pengim: 'bho5',
      ipa: 'bo⁵⁵',
      occurrences: 1,
      examples: [],
      clips: [],
    },
  ],
}

function stubFetch(data: SoundsData) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))),
  )
}

/** Branches on request URL so /api/local-recordings gets its own realistic response, distinct from sounds.json. */
function stubFetchWithLocalRecordings(data: SoundsData, localRecordings: { published?: Record<string, unknown>; pending?: string[] }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      const body = url.includes('/api/local-recordings') ? localRecordings : data
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    }),
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

describe('SoundsView play button (issue #132)', () => {
  // jsdom implements neither, and calling them unstubbed emits a jsdomError.
  let play: ReturnType<typeof vi.spyOn>
  let pause: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('labels the play button with the speaker for a published clip', async () => {
    stubFetchWithLocalRecordings(FIXTURE, {
      published: { a1: [{ url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1.wav', speaker: 'speaker-1' }] },
    })
    render(<SoundsView />)

    expect(await screen.findByRole('button', { name: 'Play recording by speaker-1' })).toHaveTextContent('speaker-1')
  })

  it('falls back to a generic "Play" label when the clip has no speaker', async () => {
    stubFetchWithLocalRecordings(FIXTURE, {
      published: { a1: [{ url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1.wav' }] },
    })
    render(<SoundsView />)

    expect(await screen.findByRole('button', { name: 'Play recording' })).toHaveTextContent('Play')
  })

  it('shows no play button for a row with no published clip', async () => {
    stubFetchWithLocalRecordings(FIXTURE, { published: {} })
    render(<SoundsView />)

    await screen.findByText('a³³')
    expect(screen.queryByRole('button', { name: /^Play recording/ })).not.toBeInTheDocument()
  })

  it('plays the clip and marks the button as pressed', async () => {
    stubFetchWithLocalRecordings(FIXTURE, {
      published: { a1: [{ url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1.wav', speaker: 'speaker-1' }] },
    })
    render(<SoundsView />)
    const button = await screen.findByRole('button', { name: 'Play recording by speaker-1' })

    fireEvent.click(button)

    expect(play).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('stops the first clip when a second row is played', async () => {
    stubFetchWithLocalRecordings(FIXTURE, {
      published: {
        a1: [{ url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1.wav', speaker: 'speaker-1' }],
        ai3: [{ url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/ai3.wav', speaker: 'speaker-2' }],
      },
    })
    render(<SoundsView />)
    const first = await screen.findByRole('button', { name: 'Play recording by speaker-1' })
    const second = await screen.findByRole('button', { name: 'Play recording by speaker-2' })

    fireEvent.click(first)
    fireEvent.click(second)

    expect(pause).toHaveBeenCalled()
    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(second).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SoundsView play button with multiple speakers (issue #134)', () => {
  let play: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders one distinguishable button per clip when a syllable has recordings from more than one speaker', async () => {
    stubFetchWithLocalRecordings(FIXTURE, {
      published: {
        a1: [
          { url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1-1.wav', speaker: 'speaker-1' },
          { url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1-2.wav', speaker: 'speaker-2' },
        ],
      },
    })
    render(<SoundsView />)

    expect(await screen.findByRole('button', { name: 'Play recording by speaker-1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play recording by speaker-2' })).toBeInTheDocument()
  })

  it('plays only the clicked clip and keeps the other button unpressed', async () => {
    stubFetchWithLocalRecordings(FIXTURE, {
      published: {
        a1: [
          { url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1-1.wav', speaker: 'speaker-1' },
          { url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1-2.wav', speaker: 'speaker-2' },
        ],
      },
    })
    render(<SoundsView />)
    const first = await screen.findByRole('button', { name: 'Play recording by speaker-1' })
    const second = await screen.findByRole('button', { name: 'Play recording by speaker-2' })

    fireEvent.click(second)

    expect(play).toHaveBeenCalledTimes(1)
    expect(second).toHaveAttribute('aria-pressed', 'true')
    expect(first).toHaveAttribute('aria-pressed', 'false')
  })

  it('numbers unlabeled clips so two speakerless recordings stay distinguishable', async () => {
    stubFetchWithLocalRecordings(FIXTURE, {
      published: {
        a1: [
          { url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1-1.wav' },
          { url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1-2.wav' },
        ],
      },
    })
    render(<SoundsView />)

    expect(await screen.findByRole('button', { name: 'Play recording 1' })).toHaveTextContent('Recording 1')
    expect(screen.getByRole('button', { name: 'Play recording 2' })).toHaveTextContent('Recording 2')
  })
})

const PROD_FIXTURE: SoundsData = {
  variety: 'chaozhou',
  sounds: [
    {
      pengim: 'a1',
      ipa: 'a³³',
      occurrences: 5,
      examples: [{ headword: '阿', pengim: 'a1', gloss: 'kinship prefix' }],
      clips: [{ url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/a1.wav', speaker: 'speaker-1' }],
    },
  ],
}

describe('SoundsView play button in production (issue #149)', () => {
  let play: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.stubEnv('DEV', false)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('shows a working play button in production for a syllable with a clip (A–Z)', async () => {
    stubFetch(PROD_FIXTURE)
    render(<SoundsView />)
    const button = await screen.findByRole('button', { name: 'Play recording by speaker-1' })

    fireEvent.click(button)

    expect(play).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a working play button in production in Frequency sort mode too', async () => {
    stubFetch(PROD_FIXTURE)
    render(<SoundsView />)
    await screen.findByRole('button', { name: 'Play recording by speaker-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Frequency' }))

    expect(await screen.findByRole('button', { name: 'Play recording by speaker-1' })).toBeInTheDocument()
  })

  it('renders no play button and no record control in production for a syllable with no clips', async () => {
    stubFetch(FIXTURE)
    render(<SoundsView />)

    await screen.findByText('a³³')
    expect(screen.queryByRole('button', { name: /^Play recording/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Record|Re-record|Pending review)$/ })).not.toBeInTheDocument()
  })

  it('does not render the record control in production even when a clip exists', async () => {
    stubFetch(PROD_FIXTURE)
    render(<SoundsView />)

    await screen.findByRole('button', { name: 'Play recording by speaker-1' })
    expect(screen.queryByRole('button', { name: /^(Record|Re-record|Pending review)$/ })).not.toBeInTheDocument()
  })
})
