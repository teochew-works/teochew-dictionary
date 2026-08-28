import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SoundsView } from './SoundsView'
import type { SoundsData } from '../types/sounds'
import type { SyllableChart } from '../types/syllable-chart'

const FIXTURE: SoundsData = {
  variety: 'chaozhou',
  sounds: [
    {
      pengim: 'a1',
      ipa: 'a³³',
      initial: null,
      rime: 'a',
      tone: 1,
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
      initial: null,
      rime: 'ai',
      tone: 3,
      occurrences: 20,
      examples: [{ headword: '愛', pengim: 'ai3', gloss: 'to want' }],
      clips: [],
    },
    {
      pengim: 'bho5',
      ipa: 'bo⁵⁵',
      initial: 'bh',
      rime: 'o',
      tone: 5,
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
      initial: null,
      rime: 'a',
      tone: 1,
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

const CHART_SOUNDS: SoundsData = {
  variety: 'chaozhou',
  sounds: [
    { pengim: 'a1', ipa: 'a³³', initial: null, rime: 'a', tone: 1, occurrences: 5, examples: [{ headword: '阿', pengim: 'a1', gloss: 'kinship prefix' }], clips: [] },
    {
      pengim: 'ai3',
      ipa: 'ai²¹³',
      initial: null,
      rime: 'ai',
      tone: 3,
      occurrences: 20,
      examples: [{ headword: '愛', pengim: 'ai3', gloss: 'to want' }],
      clips: [{ url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/x/ai3.wav', speaker: 'speaker-1' }],
    },
    { pengim: 'bho5', ipa: 'bo⁵⁵', initial: 'bh', rime: 'o', tone: 5, occurrences: 1, examples: [], clips: [] },
  ],
}

const CHART_FIXTURE: SyllableChart = {
  list: 'syllable-chart',
  initials: [{ pengim: '' }, { pengim: 'bh', example: '無', examplePengim: 'bho5' }],
  rimes: ['a', 'ai', 'o'],
  cells: [
    { initial: '', rime: 'a', legalTones: [1, 2, 3, 5, 6, 7], attestedTones: [1], recordedTones: [], stagedTones: [] },
    { initial: '', rime: 'ai', legalTones: [1, 2, 3, 5, 6, 7], attestedTones: [3], recordedTones: [3], stagedTones: [] },
    { initial: '', rime: 'o', legalTones: [1, 2, 3, 5, 6, 7], attestedTones: [], recordedTones: [], stagedTones: [] },
    { initial: 'bh', rime: 'a', legalTones: [1, 2, 3, 5, 6, 7], attestedTones: [], recordedTones: [], stagedTones: [] },
    { initial: 'bh', rime: 'ai', legalTones: [1, 2, 3, 5, 6, 7], attestedTones: [], recordedTones: [], stagedTones: [] },
    { initial: 'bh', rime: 'o', legalTones: [1, 2, 3, 5, 6, 7], attestedTones: [5], recordedTones: [], stagedTones: [5] },
  ],
  coverage: {
    cellsAttested: 3,
    cellsWithRecording: 1,
    syllablesAttested: 3,
    syllablesRecorded: 1,
    cellsWithStaging: 1,
    syllablesStaged: 1,
  },
}

function stubFetchWithChart(soundsData: SoundsData, chartData: SyllableChart) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('syllable-chart.json')) {
        return Promise.resolve(new Response(JSON.stringify(chartData), { status: 200 }))
      }
      if (url.includes('/api/local-recordings')) {
        return Promise.resolve(new Response('not found', { status: 404 }))
      }
      return Promise.resolve(new Response(JSON.stringify(soundsData), { status: 200 }))
    }),
  )
}

describe('SoundsView chart view (issue #171)', () => {
  let play: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('switches to the grid and hides the alphabet nav', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    render(<SoundsView />)
    await screen.findByText('a³³') // wait for the initial A–Z render first

    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))

    const grid = await screen.findByRole('grid', { name: /syllable chart/i })
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(1 + CHART_FIXTURE.initials.length) // + rime corner
    expect(within(grid).getAllByRole('rowheader')).toHaveLength(CHART_FIXTURE.rimes.length)
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(CHART_FIXTURE.cells.length)
    expect(screen.queryByLabelText('Jump to initial')).not.toBeInTheDocument()
  })

  it('clicking an attested cell populates the detail panel with tone, pengim, IPA, and examples', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))

    const cell = await screen.findByRole('gridcell', { name: /no initial, rime a: attested/i })
    fireEvent.click(cell)

    const panel = screen.getByLabelText('Cell detail')
    expect(within(panel).getAllByText('a1')).toHaveLength(2) // sound-row__pengim + example's own pengim
    expect(within(panel).getByText('a³³')).toBeInTheDocument()
    expect(within(panel).getByText('阿')).toBeInTheDocument()
    expect(within(panel).getByText('1')).toBeInTheDocument() // tone badge
  })

  it('clicking a legal-unattested cell shows a distinct message and no tone rows', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))

    const cell = await screen.findByRole('gridcell', { name: /no initial, rime o: legal, unattested/i })
    fireEvent.click(cell)

    const panel = screen.getByLabelText('Cell detail')
    expect(within(panel).getByText(/none attested yet/i)).toBeInTheDocument()
  })

  it('shows a working PlayClipButton in the panel for a tone with a clip, and RecordClipButton for one without (dev mode)', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))

    // ai3 (no initial, rime ai) has a clip.
    fireEvent.click(await screen.findByRole('gridcell', { name: /no initial, rime ai: attested/i }))
    const playButton = within(screen.getByLabelText('Cell detail')).getByRole('button', {
      name: 'Play recording by speaker-1',
    })
    fireEvent.click(playButton)
    expect(play).toHaveBeenCalledTimes(1)

    // bho5 (bh initial, rime o) has no clip.
    fireEvent.click(screen.getByRole('gridcell', { name: /bh initial, rime o: attested/i }))
    expect(
      within(screen.getByLabelText('Cell detail')).getByRole('button', { name: /^Record$/ }),
    ).toBeInTheDocument()
  })

  it('dims non-matching cells on search without changing how many cells are rendered', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    const { container } = render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))
    await screen.findByRole('grid', { name: /syllable chart/i })

    const totalBefore = container.querySelectorAll('.sounds-view__chart-cell').length

    // Matches only the 'a1' sound (rime 'a', zero initial) — the other 5 cells should dim.
    fireEvent.change(screen.getByLabelText('Search the sound inventory'), { target: { value: 'a1' } })

    const totalAfter = container.querySelectorAll('.sounds-view__chart-cell').length
    expect(totalAfter).toBe(totalBefore)
    expect(container.querySelectorAll('.sounds-view__chart-cell--dimmed').length).toBe(5)
  })

  it('toggling audio coverage re-shades cells and shows a summary built from the fetched data', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    const { container } = render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))
    await screen.findByRole('grid', { name: /syllable chart/i })

    expect(screen.getByText(/1 \/ 3 syllables recorded/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Audio coverage' }))

    expect(container.querySelector('.sounds-view__chart-cell--coverage-all')).not.toBeNull()
  })

  it('shades a staged-only cell with the blue tier and includes the staged count in the summary (issue #183)', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    const { container } = render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))
    await screen.findByRole('grid', { name: /syllable chart/i })

    expect(screen.getByText(/1 staged, pending review \(1 cells\)/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Audio coverage' }))

    expect(container.querySelector('.sounds-view__chart-cell--coverage-staged-all')).not.toBeNull()
  })

  it('lets the detail panel be resized by dragging the divider', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))
    await screen.findByRole('grid', { name: /syllable chart/i })

    const resizer = screen.getByRole('separator', { name: 'Resize detail panel' })
    const panel = screen.getByLabelText('Cell detail')
    const widthBefore = panel.style.width

    fireEvent.mouseDown(resizer, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 300 }) // dragging left should widen a right-pinned panel
    fireEvent.mouseUp(window)

    expect(panel.style.width).not.toBe(widthBefore)
  })

  it('does not link an example entry\'s Peng\'im to mogher.com when the setting is off (or unset)', async () => {
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))
    fireEvent.click(await screen.findByRole('gridcell', { name: /no initial, rime a: attested/i }))

    const panel = screen.getByLabelText('Cell detail')
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
  })

  it('links an example entry\'s Peng\'im to mogher.com\'s per-syllable page when the setting is on', async () => {
    localStorage.setItem('teochew-dictionary:mogher-links', 'true')
    stubFetchWithChart(CHART_SOUNDS, CHART_FIXTURE)
    render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))
    fireEvent.click(await screen.findByRole('gridcell', { name: /no initial, rime a: attested/i }))

    const panel = screen.getByLabelText('Cell detail')
    const link = within(panel).getByRole('link', { name: 'a1' })
    expect(link).toHaveAttribute('href', 'https://mogher.com/dic/czpy/a1')
    expect(link).toHaveAttribute('target', '_blank')
    // The syllable/tone row's own Peng'im (not an example entry) is never linked.
    expect(within(panel).getAllByRole('link')).toHaveLength(1)
  })

  it('blends green and blue for a cell with both recorded and staged-only tones (issue #183)', async () => {
    const sounds: SoundsData = {
      variety: 'chaozhou',
      sounds: [
        { pengim: 'a1', ipa: 'a33', initial: null, rime: 'a', tone: 1, occurrences: 1, examples: [], clips: [{ url: 'https://x/1' }] },
        { pengim: 'a2', ipa: 'a53', initial: null, rime: 'a', tone: 2, occurrences: 1, examples: [], clips: [] },
      ],
    }
    const chart: SyllableChart = {
      list: 'syllable-chart',
      initials: [{ pengim: '' }],
      rimes: ['a'],
      cells: [
        { initial: '', rime: 'a', legalTones: [1, 2, 3, 5, 6, 7], attestedTones: [1, 2], recordedTones: [1], stagedTones: [2] },
      ],
      coverage: {
        cellsAttested: 1,
        cellsWithRecording: 1,
        syllablesAttested: 2,
        syllablesRecorded: 1,
        cellsWithStaging: 1,
        syllablesStaged: 1,
      },
    }
    stubFetchWithChart(sounds, chart)
    const { container } = render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))
    await screen.findByRole('grid', { name: /syllable chart/i })

    fireEvent.click(screen.getByRole('button', { name: 'Audio coverage' }))

    expect(container.querySelector('.sounds-view__chart-cell--coverage-mixed-all')).not.toBeNull()
    expect(container.querySelector('.sounds-view__chart-tone--staged')).not.toBeNull()
  })
})

// Two cells sharing tone 2 (only 8 tone values exist, so most cell pairs
// share at least one) — used to reproduce issue #175.
const SHARED_TONE_SOUNDS: SoundsData = {
  variety: 'chaozhou',
  sounds: [
    { pengim: 'u2', ipa: 'u⁵³', initial: null, rime: 'u', tone: 2, occurrences: 1, examples: [], clips: [] },
    { pengim: 'bu2', ipa: 'bu⁵³', initial: 'b', rime: 'u', tone: 2, occurrences: 1, examples: [], clips: [] },
  ],
}

const SHARED_TONE_CHART: SyllableChart = {
  list: 'syllable-chart',
  initials: [{ pengim: '' }, { pengim: 'b' }],
  rimes: ['u'],
  cells: [
    { initial: '', rime: 'u', legalTones: [1, 2], attestedTones: [2], recordedTones: [], stagedTones: [] },
    { initial: 'b', rime: 'u', legalTones: [1, 2], attestedTones: [2], recordedTones: [], stagedTones: [] },
  ],
  coverage: {
    cellsAttested: 2,
    cellsWithRecording: 0,
    syllablesAttested: 2,
    syllablesRecorded: 0,
    cellsWithStaging: 0,
    syllablesStaged: 0,
  },
}

function stubFetchSharedTone() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('syllable-chart.json')) {
        return Promise.resolve(new Response(JSON.stringify(SHARED_TONE_CHART), { status: 200 }))
      }
      if (url.includes('/api/local-recordings')) {
        return Promise.resolve(new Response('not found', { status: 404 }))
      }
      return Promise.resolve(new Response(JSON.stringify(SHARED_TONE_SOUNDS), { status: 200 }))
    }),
  )
}

class FakeMediaRecorder {
  static isTypeSupported = () => true
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm'
  }

  start() {}

  stop() {
    this.ondataavailable?.({ data: new Blob(['fake audio bytes'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

function stubMedia() {
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }))
}

describe('SoundsView chart view — recording state does not leak between cells (issue #175)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('resets an in-progress preview when switching to a different cell that shares a tone', async () => {
    stubFetchSharedTone()
    stubMedia()
    render(<SoundsView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chart' }))

    // u2 (no initial, rime u) attests tone 2 — start a recording and get to the preview phase.
    fireEvent.click(await screen.findByRole('gridcell', { name: /no initial, rime u: attested/i }))
    fireEvent.click(within(screen.getByLabelText('Cell detail')).getByRole('button', { name: 'Record' }))
    fireEvent.click(screen.getByRole('button', { name: '● Start recording' }))
    fireEvent.click(await screen.findByRole('button', { name: '■ Stop' }))
    await screen.findByRole('button', { name: 'Save to staging' })

    // bu2 (initial 'b', rime u) also attests tone 2 — the previous fix keyed rows by
    // tone, so React would reuse the same <li>/RecordClipButton instance here instead
    // of remounting it, carrying the stale preview over.
    fireEvent.click(screen.getByRole('gridcell', { name: /b initial, rime u: attested/i }))

    const panel = screen.getByLabelText('Cell detail')
    expect(within(panel).getByRole('button', { name: 'Record' })).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Save to staging' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('group', { name: /Record a clip for/ })).not.toBeInTheDocument()
  })
})
