import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EntryDetail } from './EntryDetail'
import type { AudioReference, EnrichedEntry, EnrichedReading } from '@teochew/core'

const READING: EnrichedReading = {
  pengim: 'dio5 ziu1',
  variety: 'chaozhou',
  ipa: 'tie⁵⁵ tsiu³³',
  poj: 'tiô-tsiu',
  sandhi: 'dio5 ziu1',
  ipa_confidence: 'medium',
  ipa_caveats: [],
  pengim_toneless: 'dio ziu',
  syllable_count: 2,
  audio: [null, null],
  sandhiAudio: [null, null],
  wordAudio: null,
}

const ENTRY: EnrichedEntry = {
  id: 'dio5-ziu1-潮州',
  headword: '潮州',
  readings: [READING],
  senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
  sources: ['seed', 'wiktionary'],
  search_keys: ['潮州', 'dio5 ziu1', 'Chaozhou'],
  licence: 'CC-BY-SA-4.0',
  attributions: ['Wiktionary (CC-BY-SA-4.0)'],
}

const WORD_CLIP: AudioReference = {
  key: 'dio5 ziu1',
  url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-lingualibre/dio5-ziu1.opus',
  confidence: 'high',
  licence: 'CC-BY-SA-4.0',
  attributions: ['Lingua Libre (CC-BY-SA-4.0)'],
}

const SYLLABLE_CLIP: AudioReference = {
  key: 'dio5',
  url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/dio5.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: ['Teochew Dictionary audio (CC-BY-4.0)'],
}

/** Clips present, and deliberately licensed differently from the entry itself. */
const WITH_AUDIO: EnrichedEntry = {
  ...ENTRY,
  licence: 'CC-BY-4.0',
  attributions: ['Teochew Dictionary (CC-BY-4.0)'],
  readings: [{ ...READING, audio: [SYLLABLE_CLIP, null], wordAudio: WORD_CLIP }],
}

describe('EntryDetail', () => {
  afterEach(cleanup)

  it('hides licence and attributions when showLicence is false', () => {
    render(<EntryDetail entry={ENTRY} showLicence={false} />)
    expect(screen.queryByText(/Licence:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Wiktionary (CC-BY-SA-4.0)')).not.toBeInTheDocument()
  })

  it('shows licence (linked) and attributions when showLicence is true', () => {
    render(<EntryDetail entry={ENTRY} showLicence={true} />)
    const link = screen.getByRole('link', { name: 'CC-BY-SA-4.0' })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/teochew-works/teochew-dictionary/blob/main/LICENSE-DATA-CC-BY-SA-4.0',
    )
    expect(screen.getByText('Wiktionary (CC-BY-SA-4.0)')).toBeInTheDocument()
  })

  it('omits the attributions list when there are none', () => {
    render(<EntryDetail entry={{ ...ENTRY, attributions: [] }} showLicence={true} />)
    expect(screen.getByRole('link', { name: 'CC-BY-SA-4.0' })).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows a level badge when the entry has a level', () => {
    render(<EntryDetail entry={{ ...ENTRY, level: 'A2' }} showLicence={false} />)
    expect(screen.getByText('A2')).toBeInTheDocument()
  })

  it('omits the level badge when the entry has no level', () => {
    render(<EntryDetail entry={ENTRY} showLicence={false} />)
    expect(screen.queryByText(/^[ABC][12]$/)).not.toBeInTheDocument()
  })
})

describe('EntryDetail audio', () => {
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
  })

  it('renders no clip buttons when the reading has no audio', () => {
    render(<EntryDetail entry={ENTRY} showLicence={false} />)
    expect(screen.queryAllByRole('button', { name: /^Play / })).toHaveLength(0)
  })

  it('renders the whole-word clip first, then one button per recorded syllable', () => {
    // Default audioMode is 'both', and this reading's wordAudio makes it
    // combinable — see the 'audioMode' describe block for mode-specific cases.
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)
    const buttons = screen.getAllByRole('button', { name: /^Play / })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Play combined recording of dio5 ziu1',
      'Play whole-word recording of dio5 ziu1',
      'Play recording of syllable dio5',
    ])
  })

  it('plays a syllable clip with a Media Fragments URI when it has precomputed silence-trim boundaries (issue #252)', () => {
    const trimmed: AudioReference = { ...SYLLABLE_CLIP, trimStartMs: 239, trimEndMs: 677 }
    const entry: EnrichedEntry = { ...ENTRY, readings: [{ ...READING, audio: [trimmed, null] }] }
    render(<EntryDetail entry={entry} showLicence={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play recording of syllable dio5' }))

    const element = play.mock.instances[0] as HTMLAudioElement
    expect(element.src).toBe(`${SYLLABLE_CLIP.url}#t=0.239,0.677`)
  })

  it('plays an untrimmed clip at its bare url — no fragment when neither boundary is set', () => {
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play whole-word recording of dio5 ziu1' }))

    const element = play.mock.instances[0] as HTMLAudioElement
    expect(element.src).toBe(WORD_CLIP.url)
  })

  it('plays the combined wordAudio clip with its Media Fragments URI too', () => {
    const trimmedWord: AudioReference = { ...WORD_CLIP, trimStartMs: 50, trimEndMs: 900 }
    const entry: EnrichedEntry = { ...WITH_AUDIO, readings: [{ ...READING, audio: [SYLLABLE_CLIP, null], wordAudio: trimmedWord }] }
    render(<EntryDetail entry={entry} showLicence={false} />)

    fireEvent.click(screen.getByRole('button', { name: /^Play combined/ }))

    const element = play.mock.instances[0] as HTMLAudioElement
    expect(element.src).toBe(`${WORD_CLIP.url}#t=0.05,0.9`)
  })

  it('skips syllable slots with no recording', () => {
    const entry = {
      ...ENTRY,
      readings: [{ ...READING, audio: [null, SYLLABLE_CLIP] }],
    }
    render(<EntryDetail entry={entry} showLicence={false} />)
    expect(screen.getAllByRole('button', { name: /^Play / })).toHaveLength(1)
  })

  it('renders one button per slot when a reduplicated reading resolves to the same clip twice', () => {
    // mang7 mang7 — both syllables share a url, so the buttons cannot be
    // keyed by it.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [{ ...READING, audio: [SYLLABLE_CLIP, SYLLABLE_CLIP] }],
    }

    render(<EntryDetail entry={entry} showLicence={false} />)

    expect(screen.getAllByRole('button', { name: 'Play recording of syllable dio5' })).toHaveLength(2)
    expect(warn).not.toHaveBeenCalled()
  })

  it('treats a reduplicated reading as two independent buttons, not one shared playing state', () => {
    // Playback state is keyed by button, not by the clip url the two
    // syllables happen to share — otherwise starting the first would show
    // both as playing, and clicking the second would stop instead of start.
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [{ ...READING, audio: [SYLLABLE_CLIP, SYLLABLE_CLIP] }],
    }

    render(<EntryDetail entry={entry} showLicence={false} />)
    const [first, second] = screen.getAllByRole('button', { name: 'Play recording of syllable dio5' })

    fireEvent.click(first!)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(second).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(second!)
    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(second).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not link playing state across readings that share a clip url', () => {
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [
        { ...READING, pengim: 'a', audio: [SYLLABLE_CLIP, null] },
        { ...READING, pengim: 'b', audio: [SYLLABLE_CLIP, null] },
      ],
    }

    render(<EntryDetail entry={entry} showLicence={false} />)
    const [first, second] = screen.getAllByRole('button', { name: 'Play recording of syllable dio5' })

    fireEvent.click(first!)
    expect(first).toHaveAttribute('aria-pressed', 'true')
    expect(second).toHaveAttribute('aria-pressed', 'false')
  })

  it('plays a clip and marks its button as pressed', () => {
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)
    const word = screen.getByRole('button', { name: 'Play whole-word recording of dio5 ziu1' })

    fireEvent.click(word)

    expect(play).toHaveBeenCalledTimes(1)
    expect(word).toHaveAttribute('aria-pressed', 'true')
  })

  it('stops the playing clip when another one starts', () => {
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)
    const word = screen.getByRole('button', { name: 'Play whole-word recording of dio5 ziu1' })
    const syllable = screen.getByRole('button', { name: 'Play recording of syllable dio5' })

    fireEvent.click(word)
    fireEvent.click(syllable)

    expect(pause).toHaveBeenCalled()
    expect(word).toHaveAttribute('aria-pressed', 'false')
    expect(syllable).toHaveAttribute('aria-pressed', 'true')
    expect(play).toHaveBeenCalledTimes(2)
    // Both clips went through the same element — that is what makes the
    // second one interrupt the first rather than layer over it.
    expect(play.mock.instances[0]).toBe(play.mock.instances[1])
  })

  it('stops playback when the playing clip is clicked again', () => {
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)
    const word = screen.getByRole('button', { name: 'Play whole-word recording of dio5 ziu1' })

    fireEvent.click(word)
    fireEvent.click(word)

    expect(pause).toHaveBeenCalled()
    expect(play).toHaveBeenCalledTimes(1)
    expect(word).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not let an interrupted clip abandon the clip switched to after it', async () => {
    // Switching clips reuses the same <audio> element, which aborts the
    // first clip's in-flight play() request and rejects its promise — that
    // rejection must not clobber the second clip's state once it's current.
    let rejectFirst: (reason: unknown) => void = () => {}
    play.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectFirst = reject)))

    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)
    const word = screen.getByRole('button', { name: 'Play whole-word recording of dio5 ziu1' })
    const syllable = screen.getByRole('button', { name: 'Play recording of syllable dio5' })

    fireEvent.click(word)
    fireEvent.click(syllable)
    rejectFirst(new DOMException('interrupted', 'AbortError'))
    await Promise.resolve().then().then()

    expect(syllable).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides clip licence and attributions when showLicence is false', () => {
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)
    expect(screen.queryByText(/Audio clips:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Lingua Libre (CC-BY-SA-4.0)')).not.toBeInTheDocument()
  })

  it('credits each clip licence separately from the entry licence when showLicence is true', () => {
    render(<EntryDetail entry={WITH_AUDIO} showLicence={true} />)

    // The entry is CC-BY-4.0; its Lingua Libre word clip is CC-BY-SA-4.0, so
    // the entry-level notice does not cover it.
    expect(screen.getAllByText(/Audio clips:/)).toHaveLength(2)
    expect(screen.getByText('Lingua Libre (CC-BY-SA-4.0)')).toBeInTheDocument()
    expect(screen.getByText('Teochew Dictionary audio (CC-BY-4.0)')).toBeInTheDocument()
    expect(screen.getByText('Teochew Dictionary (CC-BY-4.0)')).toBeInTheDocument()
  })

  it('credits a shared clip licence once', () => {
    const entry: EnrichedEntry = {
      ...WITH_AUDIO,
      readings: [{ ...READING, audio: [SYLLABLE_CLIP, { ...SYLLABLE_CLIP, key: 'ziu1' }], wordAudio: null }],
    }
    render(<EntryDetail entry={entry} showLicence={true} />)
    expect(screen.getAllByText(/Audio clips:/)).toHaveLength(1)
    expect(screen.getAllByText('Teochew Dictionary audio (CC-BY-4.0)')).toHaveLength(1)
  })
})

describe('EntryDetail mogher.com links', () => {
  afterEach(cleanup)

  it('renders the Peng\'im as plain text when mogherLinks is off (or omitted)', () => {
    render(<EntryDetail entry={ENTRY} showLicence={false} />)
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('links each syllable of the Peng\'im to its mogher.com syllable page when on', () => {
    render(<EntryDetail entry={ENTRY} showLicence={false} mogherLinks={true} />)

    const dio5 = screen.getByRole('link', { name: 'dio5' })
    const ziu1 = screen.getByRole('link', { name: 'ziu1' })
    expect(dio5).toHaveAttribute('href', 'https://mogher.com/dic/czpy/dio5')
    expect(ziu1).toHaveAttribute('href', 'https://mogher.com/dic/czpy/ziu1')
    expect(dio5).toHaveAttribute('target', '_blank')
    // The headword itself is never linked — mogher.com is a single-character
    // dictionary with no page for a multi-character word like 潮州.
    expect(screen.getByRole('heading', { name: '潮州' }).querySelector('a')).toBeNull()
  })

  it('preserves the displayed spacing between syllables', () => {
    render(<EntryDetail entry={ENTRY} showLicence={false} mogherLinks={true} />)
    expect(document.querySelector('.reading__pengim')).toHaveTextContent('dio5 ziu1')
  })

  it('percent-encodes a diacritic syllable in the link href', () => {
    const entry: EnrichedEntry = { ...ENTRY, readings: [{ ...READING, pengim: 'gang2 uê7' }] }
    render(<EntryDetail entry={entry} showLicence={false} mogherLinks={true} />)
    expect(screen.getByRole('link', { name: 'uê7' })).toHaveAttribute(
      'href',
      'https://mogher.com/dic/czpy/u%C3%AA7',
    )
  })
})

describe('EntryDetail audioMode', () => {
  afterEach(cleanup)

  let play: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Combinable via synthesis (not wordAudio): full same-speaker syllable coverage.
  const SYNTH_COMBINABLE: EnrichedEntry = {
    ...ENTRY,
    readings: [
      {
        ...READING,
        audio: [
          { ...SYLLABLE_CLIP, speaker: 'jky' },
          { ...SYLLABLE_CLIP, key: 'ziu1', speaker: 'jky' },
        ],
      },
    ],
  }

  // Not combinable: no wordAudio, and the syllable clips are from different speakers.
  const NOT_COMBINABLE: EnrichedEntry = {
    ...ENTRY,
    readings: [
      {
        ...READING,
        audio: [
          { ...SYLLABLE_CLIP, speaker: 'a' },
          { ...SYLLABLE_CLIP, key: 'ziu1', speaker: 'b' },
        ],
      },
    ],
  }

  it("'component' never shows a combined button, even when the reading is combinable", () => {
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} audioMode="component" />)
    expect(screen.queryByRole('button', { name: /^Play combined/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play whole-word recording of dio5 ziu1' })).toBeInTheDocument()
  })

  it("'combined' on a combinable reading hides the component buttons", () => {
    render(<EntryDetail entry={SYNTH_COMBINABLE} showLicence={false} audioMode="combined" />)
    expect(screen.getByRole('button', { name: /^Play combined/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Play recording of syllable/ })).not.toBeInTheDocument()
  })

  it("'combined' on a non-combinable reading falls back to component buttons instead of showing nothing", () => {
    render(<EntryDetail entry={NOT_COMBINABLE} showLicence={false} audioMode="combined" />)
    expect(screen.queryByRole('button', { name: /^Play combined/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Play recording of syllable/ })).toHaveLength(2)
  })

  it("'both' shows the combined button alongside component buttons", () => {
    render(<EntryDetail entry={SYNTH_COMBINABLE} showLicence={false} audioMode="both" />)
    expect(screen.getByRole('button', { name: /^Play combined/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Play recording of syllable/ })).toHaveLength(2)
  })

  it('crossfades between chained syllable clips (issue #252 phase 2): the next clip starts, muted, on the other element before the current one ends, then the two ramp across the seam', () => {
    vi.useFakeTimers()
    const secondUrl = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/ziu1.opus'
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [
        {
          ...READING,
          audio: [
            { ...SYLLABLE_CLIP, speaker: 'jky', trimStartMs: 0, trimEndMs: 500 },
            { ...SYLLABLE_CLIP, key: 'ziu1', speaker: 'jky', url: secondUrl, trimStartMs: 0, trimEndMs: 400 },
          ],
        },
      ],
    }
    render(<EntryDetail entry={entry} showLicence={false} audioMode="combined" />)
    const button = screen.getByRole('button', { name: /^Play combined/ })

    fireEvent.click(button)
    expect(play).toHaveBeenCalledTimes(1)
    const first = play.mock.instances[0] as HTMLAudioElement
    expect(first.src).toBe(`${SYLLABLE_CLIP.url}#t=0,0.5`)
    expect(first.volume).toBe(1)
    expect(button).toHaveAttribute('aria-pressed', 'true')

    // Both boundaries are known up front, so the handoff is scheduled
    // immediately — 30ms (the default crossfade) before the 500ms trimmed
    // clip's end — with no need to wait on the browser to load metadata.
    act(() => {
      vi.advanceTimersByTime(469)
    })
    expect(play).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(play).toHaveBeenCalledTimes(2)
    const second = play.mock.instances[1] as HTMLAudioElement
    // A different element — the two overlap during the crossfade, so
    // chaining them onto one element (which would abort the first) can't work.
    expect(second).not.toBe(first)
    expect(second.src).toBe(`${secondUrl}#t=0,0.4`)
    expect(second.volume).toBe(0)
    expect(button).toHaveAttribute('aria-pressed', 'true')

    // Mid-ramp: the outgoing clip is fading out as the incoming one fades in.
    act(() => {
      vi.advanceTimersByTime(15)
    })
    expect(first.volume).toBeGreaterThan(0)
    expect(first.volume).toBeLessThan(1)
    expect(second.volume).toBeGreaterThan(0)
    expect(second.volume).toBeLessThan(1)

    // Ramp complete well past the end of the crossfade window.
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(first.volume).toBe(0)
    expect(second.volume).toBe(1)

    // The last clip's own 'ended' (its trimmed end, reached via the Media
    // Fragment) is what closes out the sequence — there's no clip after it
    // to hand off to.
    act(() => second.dispatchEvent(new Event('ended')))
    expect(button).toHaveAttribute('aria-pressed', 'false')

    vi.useRealTimers()
  })

  it('waits for loadedmetadata before scheduling a handoff when a clip has no precomputed trimEndMs', () => {
    vi.useFakeTimers()
    const secondUrl = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/ziu1.opus'
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [
        {
          ...READING,
          audio: [
            { ...SYLLABLE_CLIP, speaker: 'jky' },
            { ...SYLLABLE_CLIP, key: 'ziu1', speaker: 'jky', url: secondUrl, trimStartMs: 0, trimEndMs: 100 },
          ],
        },
      ],
    }
    render(<EntryDetail entry={entry} showLicence={false} audioMode="combined" />)
    const button = screen.getByRole('button', { name: /^Play combined/ })

    fireEvent.click(button)
    const first = play.mock.instances[0] as HTMLAudioElement
    expect(first.src).toBe(SYLLABLE_CLIP.url)

    // No handoff scheduled yet — the natural duration isn't known.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(play).toHaveBeenCalledTimes(1)

    Object.defineProperty(first, 'duration', { value: 0.2, configurable: true })
    act(() => first.dispatchEvent(new Event('loadedmetadata')))

    act(() => {
      vi.advanceTimersByTime(170)
    })
    expect(play).toHaveBeenCalledTimes(2)
    expect(button).toHaveAttribute('aria-pressed', 'true')

    vi.useRealTimers()
  })

  it('stops the sequence when a component button is clicked mid-chain', () => {
    const secondUrl = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/ziu1.opus'
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [
        {
          ...READING,
          audio: [
            { ...SYLLABLE_CLIP, speaker: 'jky' },
            { ...SYLLABLE_CLIP, key: 'ziu1', speaker: 'jky', url: secondUrl },
          ],
        },
      ],
    }
    render(<EntryDetail entry={entry} showLicence={false} audioMode="both" />)
    const combined = screen.getByRole('button', { name: /^Play combined/ })
    const [syllable] = screen.getAllByRole('button', { name: /^Play recording of syllable/ })

    fireEvent.click(combined)
    fireEvent.click(syllable!)

    expect(combined).toHaveAttribute('aria-pressed', 'false')
    expect(syllable).toHaveAttribute('aria-pressed', 'true')
  })

  it("does not let an interrupted combined sequence's stale continuation clobber the clip switched to after it", async () => {
    // Reusing the element to switch clips aborts the combined sequence's
    // in-flight play() request, which rejects its promise — the same hazard
    // useAudioPlayer's requestId guard already protects `play` from.
    const secondUrl = 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/ziu1.opus'
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [
        {
          ...READING,
          audio: [
            { ...SYLLABLE_CLIP, speaker: 'jky' },
            { ...SYLLABLE_CLIP, key: 'ziu1', speaker: 'jky', url: secondUrl },
          ],
        },
      ],
    }
    let rejectFirst: (reason: unknown) => void = () => {}
    play.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectFirst = reject)))

    render(<EntryDetail entry={entry} showLicence={false} audioMode="both" />)
    const combined = screen.getByRole('button', { name: /^Play combined/ })
    const [syllable] = screen.getAllByRole('button', { name: /^Play recording of syllable/ })

    fireEvent.click(combined)
    fireEvent.click(syllable!)
    rejectFirst(new DOMException('interrupted', 'AbortError'))
    await Promise.resolve().then().then()

    // The stale sequence must not resurrect the combined button, advance to
    // the second clip, or clear the syllable button it was interrupted by.
    expect(combined).toHaveAttribute('aria-pressed', 'false')
    expect(syllable).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('EntryDetail pronunciation', () => {
  afterEach(cleanup)

  it('defaults to citation clips when no pronunciation prop is passed', () => {
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [{ ...READING, audio: [SYLLABLE_CLIP, null], sandhiAudio: [null, null] }],
    }
    render(<EntryDetail entry={entry} showLicence={false} />)
    expect(screen.getByRole('button', { name: 'Play recording of syllable dio5' })).toBeInTheDocument()
  })

  it('plays sandhi clips when pronunciation="sandhi" is passed', () => {
    const entry: EnrichedEntry = {
      ...ENTRY,
      readings: [{ ...READING, audio: [null, null], sandhiAudio: [SYLLABLE_CLIP, null] }],
    }
    render(<EntryDetail entry={entry} showLicence={false} pronunciation="sandhi" />)
    expect(screen.getByRole('button', { name: 'Play recording of syllable dio5' })).toBeInTheDocument()
  })
})
