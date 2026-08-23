import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EntryDetail } from './EntryDetail'
import type { AudioReference, EnrichedEntry, EnrichedReading } from '../types/dict'

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
    render(<EntryDetail entry={WITH_AUDIO} showLicence={false} />)
    const buttons = screen.getAllByRole('button', { name: /^Play / })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Play whole-word recording of dio5 ziu1',
      'Play recording of syllable dio5',
    ])
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
