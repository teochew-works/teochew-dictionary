import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FlashcardsView } from './FlashcardsView'
import { makeEntry, makeReading } from '../test/entryFixtures'
import type { AudioReference } from '../types/dict'
import { readDecksState, writeDecksState } from '../decks/storage'
import { DICTIONARY_DECK_ID } from '../decks/virtualDeck'

const CLIP: AudioReference = {
  key: 'dio5',
  url: 'https://example.com/dio5.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: [],
}

describe('FlashcardsView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows a "nothing due" state when there are no entries to review', async () => {
    render(<FlashcardsView entries={[]} />)
    expect(await screen.findByText(/nothing due/i)).toBeInTheDocument()
  })

  it('defaults the prompt mode selector to Chinese', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)
    expect(screen.getByLabelText('Flashcard prompt')).toHaveValue('chinese')
  })

  it('persists the selected prompt mode to localStorage', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)

    fireEvent.change(screen.getByLabelText('Flashcard prompt'), { target: { value: 'audio-only' } })

    expect(localStorage.getItem('teochew-dictionary:flashcard-prompt-mode')).toBe('audio-only')
  })

  it('picks up a previously persisted prompt mode on mount', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-prompt-mode', 'english')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)
    expect(screen.getByLabelText('Flashcard prompt')).toHaveValue('english')
  })

  it('excludes entries lacking the field a mode depends on, with a distinct empty-state message', async () => {
    const glossless = makeEntry({ id: 'no-gloss', senses: [{ pos: 'noun', gloss_en: [] }] })
    render(<FlashcardsView entries={[glossless]} />)

    fireEvent.change(await screen.findByLabelText('Flashcard prompt'), { target: { value: 'english' } })

    expect(await screen.findByText(/No entries are available for English mode/)).toBeInTheDocument()
  })
})

describe('FlashcardsView level filter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('checks every level and untiered by default', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)

    for (const label of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Untiered']) {
      expect(screen.getByLabelText(label)).toBeChecked()
    }
  })

  it('persists an unchecked level to localStorage and excludes matching entries', async () => {
    const a1 = makeEntry({ id: 'a1-entry', headword: 'A1詞', level: 'A1' })
    render(<FlashcardsView entries={[a1]} />)
    await screen.findByText('A1詞')

    fireEvent.click(screen.getByLabelText('A1'))

    expect(localStorage.getItem('teochew-dictionary:flashcard-level-filter')).toBe('A2,B1,B2,C1,C2,untiered')
    expect(await screen.findByText(/No entries match the selected levels/)).toBeInTheDocument()
  })

  it('restores a previously persisted level subset on mount', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'A1,B1')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)

    expect(screen.getByLabelText('A1')).toBeChecked()
    expect(screen.getByLabelText('B1')).toBeChecked()
    expect(screen.getByLabelText('A2')).not.toBeChecked()
    expect(screen.getByLabelText('Untiered')).not.toBeChecked()
  })

  it('shows a distinct empty state when no entries match the selected levels', async () => {
    const a1 = makeEntry({ id: 'a1-entry', level: 'A1' })
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'B1')
    render(<FlashcardsView entries={[a1]} />)

    expect(await screen.findByText(/No entries match the selected levels/)).toBeInTheDocument()
  })

  it('gates entries with no level behind the Untiered checkbox, independent of level checkboxes', async () => {
    const a1 = makeEntry({ id: 'a1-entry', headword: 'A1詞', level: 'A1' })
    const untiered = makeEntry({ id: 'untiered-entry', headword: '無級詞' })

    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'A1')
    render(<FlashcardsView entries={[a1, untiered]} />)
    await screen.findByText('A1詞')
    expect(screen.queryByText('無級詞')).not.toBeInTheDocument()

    cleanup()
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'untiered')
    render(<FlashcardsView entries={[a1, untiered]} />)
    await screen.findByText('無級詞')
    expect(screen.queryByText('A1詞')).not.toBeInTheDocument()
  })
})

describe('FlashcardsView pronunciation toggle', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('checks the toggle by default', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)
    expect(screen.getByLabelText('Use sandhi pronunciation')).toBeChecked()
  })

  it('persists an unchecked toggle to localStorage', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)

    fireEvent.click(screen.getByLabelText('Use sandhi pronunciation'))

    expect(localStorage.getItem('teochew-dictionary:pronunciation-mode')).toBe('citation')
  })

  it('restores a previously persisted citation preference on mount', async () => {
    localStorage.setItem('teochew-dictionary:pronunciation-mode', 'citation')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)
    expect(screen.getByLabelText('Use sandhi pronunciation')).not.toBeChecked()
  })
})

describe('FlashcardsView full-audio filter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('leaves the checkbox unchecked by default', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)
    expect(screen.getByLabelText('Only fully recorded audio')).not.toBeChecked()
  })

  it('persists the checked state to localStorage and excludes partially recorded entries', async () => {
    const partial = makeEntry({
      id: 'partial-entry',
      headword: '部分詞',
      readings: [makeReading({ audio: [CLIP, null] })],
    })
    render(<FlashcardsView entries={[partial]} />)
    await screen.findByText('部分詞')

    fireEvent.click(screen.getByLabelText('Only fully recorded audio'))

    expect(localStorage.getItem('teochew-dictionary:flashcard-full-audio-only')).toBe('true')
    expect(await screen.findByText(/No entries have fully recorded audio/)).toBeInTheDocument()
  })

  it('restores a previously persisted checked state on mount', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-full-audio-only', 'true')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)
    expect(screen.getByLabelText('Only fully recorded audio')).toBeChecked()
  })

  it('keeps a fully recorded entry when checked', async () => {
    const full = makeEntry({
      id: 'full-entry',
      headword: '全錄詞',
      readings: [makeReading({ audio: [CLIP, CLIP] })],
    })
    localStorage.setItem('teochew-dictionary:flashcard-full-audio-only', 'true')
    render(<FlashcardsView entries={[full]} />)
    expect(await screen.findByText('全錄詞')).toBeInTheDocument()
  })
})

describe('FlashcardsView deck selection (issue #187 stage 1)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('defaults to the Dictionary deck, keeping today\'s behaviour unchanged', async () => {
    const a = makeEntry({ id: 'a', headword: '一' })
    const b = makeEntry({ id: 'b', headword: '二' })
    render(<FlashcardsView entries={[a, b]} />)

    await screen.findByText(/2 in this session/)
    expect(screen.getByLabelText('Deck')).toHaveValue(DICTIONARY_DECK_ID)
    expect(screen.getByText('Dictionary')).toBeInTheDocument()
  })

  it('lists a persisted user deck and narrows the pool to it when selected', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['b'], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID],
      groups: [],
    })
    const a = makeEntry({ id: 'a', headword: '一' })
    const b = makeEntry({ id: 'b', headword: '二' })
    render(<FlashcardsView entries={[a, b]} />)
    await screen.findByText(/2 in this session/)

    fireEvent.change(screen.getByLabelText('Deck'), { target: { value: 'deck-1' } })

    await screen.findByText(/1 in this session/)
    expect(screen.getByText('二')).toBeInTheDocument()
    expect(screen.queryByText('一')).not.toBeInTheDocument()
  })

  it('persists the selected deck to the shared inPlay list so it survives a reload', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID],
      groups: [],
    })
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/nothing due/i)

    fireEvent.change(screen.getByLabelText('Deck'), { target: { value: 'deck-1' } })

    expect(readDecksState().inPlay).toEqual(['deck-1'])
  })
})

describe('FlashcardsView review queue stability (issue #187)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  // Grading triggers a re-render driven entirely by useSrsQueue's own
  // internal state (not by a new `entries` prop or a filter/deck change).
  // useSrsQueue rebuilds its queue whenever the array it's given changes
  // identity (see useSrsQueue.ts), so if the deck pipeline's output isn't
  // properly memoized, this re-render would silently rebuild the queue and
  // reset reviewedCount back to 0 — see the note on this in issue #187.
  it('does not reset review progress on the re-render grading itself triggers', async () => {
    const a = makeEntry({ id: 'a', headword: '一' })
    const b = makeEntry({ id: 'b', headword: '二' })
    render(<FlashcardsView entries={[a, b]} />)
    await screen.findByText(/2 in this session/)

    fireEvent.click(screen.getByText('Show answer'))
    fireEvent.click(screen.getByText('Good'))

    expect(await screen.findByText(/1 reviewed/)).toBeInTheDocument()
    expect(screen.queryByText(/^0 reviewed/)).not.toBeInTheDocument()
  })
})
