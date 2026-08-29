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

function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
}

describe('FlashcardsView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows an empty-table state when there are no entries to review', async () => {
    render(<FlashcardsView entries={[]} />)
    expect(await screen.findByText(/No cards are in play/i)).toBeInTheDocument()
  })

  it('defaults the prompt mode selector to Chinese', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    expect(screen.getByLabelText('Chinese')).toBeChecked()
  })

  it('persists the selected prompt mode to localStorage', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)

    fireEvent.click(screen.getByLabelText('Audio only'))

    expect(localStorage.getItem('teochew-dictionary:flashcard-prompt-mode')).toBe('audio-only')
  })

  it('picks up a previously persisted prompt mode on mount', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-prompt-mode', 'english')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    expect(screen.getByLabelText('English')).toBeChecked()
  })

  it('excludes entries lacking the field a mode depends on, with a distinct empty-state message', async () => {
    const glossless = makeEntry({ id: 'no-gloss', senses: [{ pos: 'noun', gloss_en: [] }] })
    render(<FlashcardsView entries={[glossless]} />)

    fireEvent.click(await screen.findByLabelText('English'))

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
    await screen.findByText(/reviewed/i)
    openFilters()

    for (const label of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Untiered']) {
      expect(screen.getByLabelText(label)).toBeChecked()
    }
  })

  it('persists an unchecked level to localStorage and excludes matching entries', async () => {
    const a1 = makeEntry({ id: 'a1-entry', headword: 'A1詞', level: 'A1' })
    render(<FlashcardsView entries={[a1]} />)
    await screen.findByText('A1詞')
    openFilters()

    fireEvent.click(screen.getByLabelText('A1'))

    expect(localStorage.getItem('teochew-dictionary:flashcard-level-filter')).toBe('A2,B1,B2,C1,C2,untiered')
    expect(await screen.findByText(/No entries match the selected levels/)).toBeInTheDocument()
  })

  it('restores a previously persisted level subset on mount', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'A1,B1')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    openFilters()

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
    await screen.findByText(/reviewed/i)
    openFilters()
    expect(screen.getByLabelText('Use sandhi pronunciation')).toBeChecked()
  })

  it('persists an unchecked toggle to localStorage', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    openFilters()

    fireEvent.click(screen.getByLabelText('Use sandhi pronunciation'))

    expect(localStorage.getItem('teochew-dictionary:pronunciation-mode')).toBe('citation')
  })

  it('restores a previously persisted citation preference on mount', async () => {
    localStorage.setItem('teochew-dictionary:pronunciation-mode', 'citation')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    openFilters()
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
    await screen.findByText(/reviewed/i)
    openFilters()
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
    openFilters()

    fireEvent.click(screen.getByLabelText('Only fully recorded audio'))

    expect(localStorage.getItem('teochew-dictionary:flashcard-full-audio-only')).toBe('true')
    expect(await screen.findByText(/No entries have fully recorded audio/)).toBeInTheDocument()
  })

  it('restores a previously persisted checked state on mount', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-full-audio-only', 'true')
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    openFilters()
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

describe('FlashcardsView filters popover', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('is closed by default and opens when the Filters button is clicked', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    expect(screen.queryByLabelText('Use sandhi pronunciation')).not.toBeInTheDocument()

    openFilters()

    expect(screen.getByLabelText('Use sandhi pronunciation')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    openFilters()
    expect(screen.getByLabelText('Use sandhi pronunciation')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByLabelText('Use sandhi pronunciation')).not.toBeInTheDocument()
  })

  it('closes on an outside click', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    openFilters()
    expect(screen.getByLabelText('Use sandhi pronunciation')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByLabelText('Use sandhi pronunciation')).not.toBeInTheDocument()
  })
})

describe('FlashcardsView active filter chips', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows no chips when filters are at their defaults', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    expect(screen.queryByText(/Levels:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Full audio only')).not.toBeInTheDocument()
  })

  it('echoes a narrowed level filter as a removable chip, and removing it clears the chip', async () => {
    const a1 = makeEntry({ id: 'a1', headword: 'A1詞', level: 'A1' })
    render(<FlashcardsView entries={[a1]} />)
    await screen.findByText('A1詞')
    openFilters()
    fireEvent.click(screen.getByLabelText('A2'))

    expect(screen.getByText(/Levels:/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Remove filter: Levels/ }))

    expect(screen.queryByText(/Levels:/)).not.toBeInTheDocument()
  })

  it('echoes "Full audio only" as a removable chip, and removing it unchecks the toggle', async () => {
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)
    openFilters()
    fireEvent.click(screen.getByLabelText('Only fully recorded audio'))

    expect(screen.getByText('Full audio only')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Full audio only' }))

    expect(screen.queryByText('Full audio only')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Only fully recorded audio')).not.toBeChecked()
  })
})

describe('FlashcardsView deck table (issue #187 stage 2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('has the Dictionary deck on the table by default', async () => {
    const a = makeEntry({ id: 'a' })
    const b = makeEntry({ id: 'b' })
    render(<FlashcardsView entries={[a, b]} />)

    await screen.findByText(/2 in this session/)
    expect(screen.getByText('Dictionary')).toBeInTheDocument()
    expect(screen.getByText('2 in play')).toBeInTheDocument()
  })

  it('lists a persisted user deck in "Add a deck to the table" and adds it on selection', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID],
      groups: [],
    })
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)

    fireEvent.change(screen.getByLabelText('Add a deck to the table'), { target: { value: 'deck-1' } })

    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(readDecksState().inPlay).toEqual([DICTIONARY_DECK_ID, 'deck-1'])
  })

  it('removes a deck from the table and persists it', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)

    fireEvent.click(screen.getByLabelText('Remove Kitchen from the table'))

    expect(screen.queryByLabelText('Remove Kitchen from the table')).not.toBeInTheDocument()
    expect(readDecksState().inPlay).toEqual([DICTIONARY_DECK_ID])
  })

  it('unions in-play decks and reviews a card that is in two decks only once', async () => {
    writeDecksState({
      decks: [
        { id: 'deck-a', name: 'A', hue: 'green', cards: ['shared', 'only-a'], kind: 'user' },
        { id: 'deck-b', name: 'B', hue: 'red', cards: ['shared', 'only-b'], kind: 'user' },
      ],
      inPlay: ['deck-a', 'deck-b'],
      groups: [],
    })
    const shared = makeEntry({ id: 'shared', headword: '共用' })
    const onlyA = makeEntry({ id: 'only-a', headword: '甲' })
    const onlyB = makeEntry({ id: 'only-b', headword: '乙' })
    render(<FlashcardsView entries={[shared, onlyA, onlyB]} />)

    await screen.findByText(/3 in this session/)
    expect(screen.getByText('3 in play')).toBeInTheDocument()
  })

  it('shows the in-play empty state when the only deck on the table has no cards', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Empty Deck', hue: 'green', cards: [], kind: 'user' }],
      inPlay: ['deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[makeEntry({ id: 'unused' })]} />)

    expect(await screen.findByText(/No cards are in play/)).toBeInTheDocument()
  })
})

describe('FlashcardsView deck table drag-and-drop (issue #187 stage 3)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('reorders the table via the keyboard and persists the new order', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)

    const handle = screen.getByLabelText('Reorder Dictionary')
    fireEvent.keyDown(handle, { key: ' ' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: ' ' })

    expect(readDecksState().inPlay).toEqual(['deck-1', DICTIONARY_DECK_ID])
  })

  it('announces each step of a keyboard reorder through the shared live region', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[]} />)
    await screen.findByText(/reviewed/i)

    fireEvent.keyDown(screen.getByLabelText('Reorder Dictionary'), { key: ' ' })
    expect(screen.getByRole('status')).toHaveTextContent(/Picked up Dictionary/)

    fireEvent.keyDown(screen.getByLabelText('Reorder Dictionary'), { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent(/Moved Dictionary to position 2 of 2/)
  })
})

describe('FlashcardsView funnel readout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows a single stage when nothing was filtered out', async () => {
    const a = makeEntry({ id: 'a' })
    render(<FlashcardsView entries={[a]} />)
    await screen.findByText(/1 in this session/)
    expect(screen.getByText('1 in play')).toBeInTheDocument()
  })

  it('names the stage that narrowed the pool, skipping stages that changed nothing', async () => {
    const a1 = makeEntry({ id: 'a1', level: 'A1' })
    const b1 = makeEntry({ id: 'b1', level: 'B1' })
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'A1')
    render(<FlashcardsView entries={[a1, b1]} />)

    await screen.findByText(/1 in this session/)
    expect(screen.getByText('2 in play → 1 level')).toBeInTheDocument()
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
