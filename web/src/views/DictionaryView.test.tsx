import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DictionaryView } from './DictionaryView'
import type { AudioReference, EnrichedEntry } from '../types/dict'
import { makeEntry as makeBaseEntry, makeReading } from '../test/entryFixtures'

function makeEntry({
  id,
  headword,
  gloss,
  keys,
  level,
}: {
  id: string
  headword: string
  gloss: string[]
  keys: string[]
  level?: EnrichedEntry['level']
}): EnrichedEntry {
  return makeBaseEntry({
    id,
    headword,
    readings: [makeReading({ pengim: 'bhog8', ipa: 'bok̚⁴', poj: 'bo̍k', sandhi: 'bhog8', pengim_toneless: 'bhog', syllable_count: 1, audio: [null] })],
    senses: [{ pos: 'noun', gloss_en: gloss }],
    search_keys: keys,
    ...(level ? { level } : {}),
  })
}

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

/**
 * Regression cover for the search box burying the obvious hit: results used to
 * be re-sorted by headword, so typing "wood" put the entry actually glossed
 * "wood" ~150 rows down a list of several hundred. The fixture is chosen so
 * collation order (木工, 木船, 柴) disagrees with relevance order (柴 first,
 * as the only exact gloss match).
 */
describe('DictionaryView search ordering', () => {
  const searchEntries: EnrichedEntry[] = [
    makeEntry({ id: 'woodwork', headword: '木工', gloss: ['woodwork', 'carpentry'], keys: ['木工', 'bhog8 gang1', 'woodwork', 'carpentry'] }),
    makeEntry({ id: 'wooden-boat', headword: '木船', gloss: ['wooden boat'], keys: ['木船', 'bhog8 zung5', 'wooden boat'] }),
    makeEntry({ id: 'wood', headword: '柴', gloss: ['wood', 'firewood'], keys: ['柴', 'ca5', 'wood', 'firewood'] }),
  ]

  function headwordsInOrder(): string[] {
    return screen
      .getAllByRole('button')
      .map((b) => b.querySelector('.entry-list__headword')?.textContent ?? '')
      .filter(Boolean)
  }

  function searchFor(value: string): void {
    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value } })
  }

  it('lists search hits best-match first rather than alphabetically', () => {
    render(<DictionaryView entries={searchEntries} />)
    searchFor('wood')
    expect(headwordsInOrder()[0]).toBe('柴')
  })

  it('still honours an explicitly chosen sort while searching', () => {
    render(<DictionaryView entries={searchEntries} />)
    searchFor('wood')
    fireEvent.change(screen.getByLabelText('Sort dictionary by'), { target: { value: 'headword' } })
    expect(headwordsInOrder()).toEqual(['木工', '木船', '柴'])
  })

  it('falls back to headword order when browsing with no query', () => {
    render(<DictionaryView entries={searchEntries} />)
    expect(headwordsInOrder()).toEqual(['木工', '木船', '柴'])
  })
})

/**
 * `level` (issue #113) is a grouped mode like tone and category, not a flat
 * one — a flat fallback would hand `sortFlat` a mode it cannot sort and drop
 * the grouping entirely.
 */
describe('DictionaryView grouped sort modes', () => {
  const levelled: EnrichedEntry[] = [
    makeEntry({ id: 'a1', headword: '木', gloss: ['wood'], keys: ['木', 'wood'], level: 'A1' }),
    makeEntry({ id: 'b2', headword: '木材', gloss: ['timber'], keys: ['木材', 'timber'], level: 'B2' }),
  ]

  // Scoped to the tree's own group labels: #113's LevelBadge renders the same
  // level text on every entry row, so a bare getByText('A1') matches both.
  function groupLabels(): string[] {
    return [...document.querySelectorAll('.entry-tree__label')].map((n) => n.textContent ?? '')
  }

  afterEach(cleanup)

  it('renders a grouped tree for Level rather than a flat list', () => {
    render(<DictionaryView entries={levelled} />)
    fireEvent.change(screen.getByLabelText('Sort dictionary by'), { target: { value: 'level' } })
    expect(groupLabels()).toEqual(['A1', 'B2'])
  })

  it('still groups by Level while a search is active', () => {
    render(<DictionaryView entries={levelled} />)
    fireEvent.change(screen.getByLabelText('Sort dictionary by'), { target: { value: 'level' } })
    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: 'wood' } })
    expect(groupLabels()).toEqual(['A1'])
  })
})

describe('DictionaryView audio filter', () => {
  const CLIP: AudioReference = {
    key: 'bhog8',
    url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/bhog8.opus',
    confidence: 'high',
    licence: 'CC-BY-4.0',
    attributions: ['Teochew Dictionary audio (CC-BY-4.0)'],
  }

  /** The same entry, given a whole-word recording. */
  function withClip(entry: EnrichedEntry): EnrichedEntry {
    return { ...entry, readings: [{ ...entry.readings[0]!, wordAudio: CLIP }] }
  }

  const RECORDED = withClip(makeEntry({ id: 'a1', headword: '木', gloss: ['wood'], keys: ['木', 'wood'], level: 'A1' }))
  const SILENT = makeEntry({ id: 'b2', headword: '柴', gloss: ['firewood'], keys: ['柴', 'firewood'], level: 'B2' })

  function headwords(): string[] {
    return [...document.querySelectorAll('.entry-list__headword')].map((n) => n.textContent ?? '')
  }

  afterEach(cleanup)

  it('is off by default, listing entries with and without recordings alike', () => {
    render(<DictionaryView entries={[RECORDED, SILENT]} />)
    expect(screen.getByLabelText('Only entries with audio')).not.toBeChecked()
    expect(headwords()).toEqual(['木', '柴'])
  })

  it('narrows the list to entries that have a recording, and restores it when unticked', () => {
    render(<DictionaryView entries={[RECORDED, SILENT]} />)
    const toggle = screen.getByLabelText('Only entries with audio')

    fireEvent.click(toggle)
    expect(headwords()).toEqual(['木'])

    fireEvent.click(toggle)
    expect(headwords()).toEqual(['木', '柴'])
  })

  it('applies in grouped sort modes too, not just the flat list', () => {
    render(<DictionaryView entries={[RECORDED, SILENT]} />)
    fireEvent.change(screen.getByLabelText('Sort dictionary by'), { target: { value: 'level' } })
    fireEvent.click(screen.getByLabelText('Only entries with audio'))

    expect([...document.querySelectorAll('.entry-tree__label')].map((n) => n.textContent)).toEqual(['A1'])
    expect(headwords()).toEqual(['木'])
  })

  it('says the dictionary has no recordings rather than "No matches" when none exist at all', () => {
    render(<DictionaryView entries={[SILENT]} />)
    fireEvent.click(screen.getByLabelText('Only entries with audio'))

    expect(screen.getByText('No recordings in the dictionary yet.')).toBeInTheDocument()
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument()
  })

  it('distinguishes a search that excluded every recording from an empty dataset', () => {
    render(<DictionaryView entries={[RECORDED, SILENT]} />)
    fireEvent.click(screen.getByLabelText('Only entries with audio'))
    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: 'firewood' } })

    expect(screen.getByText('No matches with a recording.')).toBeInTheDocument()
  })

  it('keeps a selected entry readable after the filter hides it from the list', () => {
    render(<DictionaryView entries={[RECORDED, SILENT]} />)
    fireEvent.click(screen.getByText('柴'))
    fireEvent.click(screen.getByLabelText('Only entries with audio'))

    expect(headwords()).toEqual(['木'])
    expect(screen.getByRole('heading', { name: '柴' })).toBeInTheDocument()
  })
})
