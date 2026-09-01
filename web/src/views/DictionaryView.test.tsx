import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DictionaryView } from './DictionaryView'
import type { AudioReference, EnrichedEntry } from '@teochew/core'
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
        sandhiAudio: [null, null],
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

  it('defaults the licensing toggle to on and shows licence info', () => {
    render(<DictionaryView entries={ENTRIES} />)
    fireEvent.click(screen.getByText('潮州'))
    expect(screen.getByLabelText('Show licensing info')).toBeChecked()
    expect(screen.getByText(/Licence:/)).toBeInTheDocument()
  })

  it('shows a decorative empty state with accessible fallback text when no entry is selected', () => {
    render(<DictionaryView entries={ENTRIES} />)
    expect(screen.getByText('食茶学字')).toBeInTheDocument()
    expect(screen.getByText('Select an entry to see its details.')).toBeInTheDocument()
  })

  it('hides licence info once toggled off and persists the choice across remounts', () => {
    const { unmount } = render(<DictionaryView entries={ENTRIES} />)
    fireEvent.click(screen.getByText('潮州'))
    fireEvent.click(screen.getByLabelText('Show licensing info'))
    expect(screen.queryByText(/Licence:/)).not.toBeInTheDocument()
    unmount()

    render(<DictionaryView entries={ENTRIES} />)
    fireEvent.click(screen.getByText('潮州'))
    expect(screen.getByLabelText('Show licensing info')).not.toBeChecked()
    expect(screen.queryByText(/Licence:/)).not.toBeInTheDocument()
  })

  it('persists the audio-only toggle across remounts (issue #173)', () => {
    const { unmount } = render(<DictionaryView entries={ENTRIES} />)
    fireEvent.click(screen.getByLabelText('Only entries with audio'))
    unmount()

    render(<DictionaryView entries={ENTRIES} />)
    expect(screen.getByLabelText('Only entries with audio')).toBeChecked()
  })

  it('persists the tone-type select via the shared pronunciation-mode setting', () => {
    render(<DictionaryView entries={ENTRIES} />)
    fireEvent.change(screen.getByLabelText('Sort dictionary by'), { target: { value: 'tone' } })
    fireEvent.change(screen.getByLabelText('Tone type'), { target: { value: 'citation' } })

    expect(localStorage.getItem('teochew-dictionary:pronunciation-mode')).toBe('citation')
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

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

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

describe('DictionaryView full-audio-only filter', () => {
  const CLIP: AudioReference = {
    key: 'bhog8',
    url: 'https://github.com/teochew-works/teochew-dictionary/releases/download/audio-chaozhou/bhog8.opus',
    confidence: 'high',
    licence: 'CC-BY-4.0',
    attributions: ['Teochew Dictionary audio (CC-BY-4.0)'],
  }

  /** The same entry, given every syllable slot a clip. */
  function withFullAudio(entry: EnrichedEntry): EnrichedEntry {
    return { ...entry, readings: [{ ...entry.readings[0]!, audio: [CLIP] }] }
  }

  /** The same entry, given only some of its syllable slots a clip. */
  function withPartialAudio(entry: EnrichedEntry): EnrichedEntry {
    return { ...entry, readings: [{ ...entry.readings[0]!, audio: [null] }] }
  }

  const FULL = withFullAudio(makeEntry({ id: 'a1', headword: '木', gloss: ['wood'], keys: ['木', 'wood'] }))
  const PARTIAL = withPartialAudio(makeEntry({ id: 'b2', headword: '柴', gloss: ['firewood'], keys: ['柴', 'firewood'] }))

  function headwords(): string[] {
    return [...document.querySelectorAll('.entry-list__headword')].map((n) => n.textContent ?? '')
  }

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('is off by default, listing partially and fully recorded entries alike', () => {
    render(<DictionaryView entries={[FULL, PARTIAL]} />)
    expect(screen.getByLabelText('Only fully recorded audio')).not.toBeChecked()
    expect(headwords()).toEqual(['木', '柴'])
  })

  it('narrows the list to entries that are fully recorded, and restores it when unticked', () => {
    render(<DictionaryView entries={[FULL, PARTIAL]} />)
    const toggle = screen.getByLabelText('Only fully recorded audio')

    fireEvent.click(toggle)
    expect(headwords()).toEqual(['木'])

    fireEvent.click(toggle)
    expect(headwords()).toEqual(['木', '柴'])
  })

  it('persists across remounts', () => {
    const { unmount } = render(<DictionaryView entries={[FULL, PARTIAL]} />)
    fireEvent.click(screen.getByLabelText('Only fully recorded audio'))
    unmount()

    render(<DictionaryView entries={[FULL, PARTIAL]} />)
    expect(screen.getByLabelText('Only fully recorded audio')).toBeChecked()
    expect(headwords()).toEqual(['木'])
  })
})

/*
 * The list used to put every one of the dictionary's 16,000+ entries in the
 * DOM, which made each keystroke rebuild the lot — up to 600ms of blocked main
 * thread, measured. These pin the cap that replaced that.
 */
describe('DictionaryView result cap', () => {
  const many = Array.from({ length: 250 }, (_, i) =>
    makeEntry({ id: `e${i}`, headword: `字${i}`, gloss: [`gloss ${i}`], keys: [`key${i}`, 'common'] }),
  )

  const rows = () => document.querySelectorAll('.entry-list__item')

  it('renders only the first page of a long list', () => {
    render(<DictionaryView entries={many} />)
    expect(rows()).toHaveLength(200)
    expect(screen.getByText('Showing 200 of 250')).toBeInTheDocument()
  })

  it('reveals more on request', () => {
    render(<DictionaryView entries={many} />)
    fireEvent.click(screen.getByRole('button', { name: /Show 50 more/ }))
    expect(rows()).toHaveLength(250)
  })

  it('stops offering more once everything is shown', () => {
    render(<DictionaryView entries={many} />)
    fireEvent.click(screen.getByRole('button', { name: /Show 50 more/ }))
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })

  it('says nothing about a cap when the list already fits', () => {
    render(<DictionaryView entries={many.slice(0, 10)} />)
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })

  it('goes back to the first page when the query changes', () => {
    render(<DictionaryView entries={many} />)
    fireEvent.click(screen.getByRole('button', { name: /Show 50 more/ }))
    expect(rows()).toHaveLength(250)

    fireEvent.change(screen.getByLabelText('Search the dictionary'), { target: { value: 'common' } })

    expect(rows()).toHaveLength(200)
  })

  it('caps a grouped sort across its groups, not per group', () => {
    const levelled = Array.from({ length: 250 }, (_, i) =>
      makeEntry({
        id: `e${i}`,
        headword: `字${i}`,
        gloss: [`gloss ${i}`],
        keys: [`key${i}`],
        level: i % 2 === 0 ? 'A1' : 'A2',
      }),
    )
    render(<DictionaryView entries={levelled} />)
    fireEvent.change(screen.getByLabelText('Sort dictionary by'), { target: { value: 'level' } })

    expect(rows()).toHaveLength(200)
    expect(screen.getByText('Showing 200 of 250')).toBeInTheDocument()
  })
})

describe('DictionaryView filters disclosure', () => {
  /**
   * Drives the phone media query by hand so a rotation can be simulated: jsdom
   * has no layout, so resizing the window would not move `matchMedia` on its
   * own. Only the phone query is answered; anything else (prefersReducedMotion)
   * keeps the suite-wide "no preference" default.
   */
  function mockPhoneBreakpoint(startsMatching: boolean) {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    let matches = startsMatching

    vi.spyOn(window, 'matchMedia').mockImplementation(
      (media: string) =>
        ({
          get matches() {
            return media === '(max-width: 640px)' ? matches : false
          },
          media,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener)
          },
          removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener)
          },
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    )

    return (next: boolean) => {
      matches = next
      act(() => {
        for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent)
      })
    }
  }

  const disclosure = () => screen.getByText('Filters').closest('details') as HTMLDetailsElement

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('starts collapsed at phone width, so results begin near the top', () => {
    mockPhoneBreakpoint(true)
    render(<DictionaryView entries={ENTRIES} />)

    expect(disclosure().open).toBe(false)
  })

  it('starts open above the phone breakpoint, where the summary is hidden', () => {
    mockPhoneBreakpoint(false)
    render(<DictionaryView entries={ENTRIES} />)

    expect(disclosure().open).toBe(true)
  })

  /*
   * The regression this guards: the breakpoint used to be read once at mount,
   * so a phone rotated to landscape crossed 640px with the disclosure still
   * closed — and above 640px the summary that would reopen it is
   * `display: none`. The filters became unreachable until a reload.
   */
  it('opens the filters when the viewport grows past the phone breakpoint', () => {
    const setPhone = mockPhoneBreakpoint(true)
    render(<DictionaryView entries={ENTRIES} />)
    expect(disclosure().open).toBe(false)

    setPhone(false)

    expect(disclosure().open).toBe(true)
  })

  it('restores the collapsed phone state when the viewport shrinks back', () => {
    const setPhone = mockPhoneBreakpoint(true)
    render(<DictionaryView entries={ENTRIES} />)

    setPhone(false)
    setPhone(true)

    expect(disclosure().open).toBe(false)
  })

  it('keeps the filters open on a phone once the summary has been tapped', () => {
    mockPhoneBreakpoint(true)
    render(<DictionaryView entries={ENTRIES} />)

    fireEvent.click(screen.getByText('Filters'))

    expect(disclosure().open).toBe(true)
  })
})
