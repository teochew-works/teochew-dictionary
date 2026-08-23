import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DictionaryView } from './DictionaryView'
import type { AudioReference, EnrichedEntry } from '../types/dict'

const ENTRIES: EnrichedEntry[] = [
  {
    id: 'dio5-ziu1-潮州',
    headword: '潮州',
    readings: [
      {
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
      },
    ],
    senses: [{ pos: 'proper-noun', gloss_en: ['Chaozhou', 'Teochew'] }],
    sources: ['seed', 'wiktionary'],
    search_keys: ['潮州', 'dio5 ziu1', 'Chaozhou'],
    licence: 'CC-BY-SA-4.0',
    attributions: ['Wiktionary (CC-BY-SA-4.0)'],
  },
]

describe('DictionaryView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('defaults the licensing toggle to off and hides licence info', () => {
    render(<DictionaryView entries={ENTRIES} />)
    fireEvent.click(screen.getByText('潮州'))
    expect(screen.getByLabelText('Show licensing info')).not.toBeChecked()
    expect(screen.queryByText(/Licence:/)).not.toBeInTheDocument()
  })

  it('shows a decorative empty state with accessible fallback text when no entry is selected', () => {
    render(<DictionaryView entries={ENTRIES} />)
    expect(screen.getByText('食茶学字')).toBeInTheDocument()
    expect(screen.getByText('Select an entry to see its details.')).toBeInTheDocument()
  })

  it('shows licence info once toggled on and persists the choice across remounts', () => {
    const { unmount } = render(<DictionaryView entries={ENTRIES} />)
    fireEvent.click(screen.getByText('潮州'))
    fireEvent.click(screen.getByLabelText('Show licensing info'))
    expect(screen.getByText(/Licence:/)).toBeInTheDocument()
    unmount()

    render(<DictionaryView entries={ENTRIES} />)
    fireEvent.click(screen.getByText('潮州'))
    expect(screen.getByLabelText('Show licensing info')).toBeChecked()
    expect(screen.getByText(/Licence:/)).toBeInTheDocument()
  })
})

describe('DictionaryView audio', () => {
  const CLIP: AudioReference = {
    key: 'dio5 ziu1',
    url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/dio5-ziu1.opus',
    confidence: 'high',
    licence: 'CC-BY-4.0',
    attributions: ['Teochew Dictionary audio (CC-BY-4.0)'],
  }

  const WITH_CLIP: EnrichedEntry[] = [
    { ...ENTRIES[0]!, readings: [{ ...ENTRIES[0]!.readings[0]!, wordAudio: CLIP }] },
    { ...ENTRIES[0]!, id: 'other', headword: '汕頭' },
  ]

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('stops a playing clip when a different entry is selected', () => {
    render(<DictionaryView entries={WITH_CLIP} />)
    fireEvent.click(screen.getByText('潮州'))
    fireEvent.click(screen.getByRole('button', { name: /^Play whole-word/ }))
    expect(screen.getByRole('button', { name: /^Play whole-word/ })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByText('汕頭'))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()

    // Back on the clip's own entry, nothing is playing any more.
    fireEvent.click(screen.getByText('潮州'))
    expect(screen.getByRole('button', { name: /^Play whole-word/ })).toHaveAttribute('aria-pressed', 'false')
  })
})
