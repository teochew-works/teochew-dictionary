import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

/** Most cases need a non-empty table, or the view is (correctly) an empty state. */
const ENTRY = makeEntry({ id: 'a', headword: '潮州' })

function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
}

function level(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}$`) })
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('FlashcardsView prompt modes', () => {
  it('defaults to prompting with Chinese', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    expect(screen.getByLabelText('Chinese')).toBeChecked()
  })

  it('persists the chosen mode', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    fireEvent.click(screen.getByLabelText('Audio only'))
    expect(localStorage.getItem('teochew-dictionary:flashcard-prompt-mode')).toBe('audio-only')
  })

  it('picks a persisted mode back up on mount', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-prompt-mode', 'english')
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    expect(screen.getByLabelText('English')).toBeChecked()
  })

  it('explains — and offers a way out of — a mode nothing on the table can satisfy', async () => {
    const glossless = makeEntry({ id: 'no-gloss', senses: [{ pos: 'noun', gloss_en: [] }] })
    render(<FlashcardsView entries={[glossless]} />)
    fireEvent.click(await screen.findByLabelText('English'))

    expect(await screen.findByText('Nothing can be prompted this way')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Prompt with Chinese instead' }))
    expect(screen.getByLabelText('Chinese')).toBeChecked()
  })
})

describe('FlashcardsView filters', () => {
  it('keeps the panel closed until asked', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    expect(screen.queryByText('Tones shown')).not.toBeInTheDocument()
    openFilters()
    expect(screen.getByText('Tones shown')).toBeInTheDocument()
  })

  it('closes on Escape and on an outside press', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    openFilters()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Tones shown')).not.toBeInTheDocument()

    openFilters()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Tones shown')).not.toBeInTheDocument()
  })

  it('starts with every level selected', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    openFilters()
    for (const name of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Untiered']) {
      expect(level(name)).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('persists a deselected level and drops the entries behind it', async () => {
    const a1 = makeEntry({ id: 'a1-entry', headword: 'A1詞', level: 'A1' })
    render(<FlashcardsView entries={[a1]} />)
    await screen.findByText('A1詞')
    openFilters()

    fireEvent.click(level('A1'))

    expect(localStorage.getItem('teochew-dictionary:flashcard-level-filter')).toBe('A2,B1,B2,C1,C2,untiered')
    expect(await screen.findByText('No cards at these levels')).toBeInTheDocument()
  })

  it('restores a persisted level subset', async () => {
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'A1,B1')
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText('No cards at these levels')
    openFilters()
    expect(level('A1')).toHaveAttribute('aria-pressed', 'true')
    expect(level('A2')).toHaveAttribute('aria-pressed', 'false')
  })

  it('gates untiered entries behind Untiered alone', async () => {
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

  it('toggles every level off and on again from one control', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    openFilters()

    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(localStorage.getItem('teochew-dictionary:flashcard-level-filter')).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(localStorage.getItem('teochew-dictionary:flashcard-level-filter')).toBe('A1,A2,B1,B2,C1,C2,untiered')
  })

  it('persists the recording filter and explains what it removed', async () => {
    const partial = makeEntry({ id: 'partial', headword: '部分詞', readings: [makeReading({ audio: [CLIP, null] })] })
    render(<FlashcardsView entries={[partial]} />)
    await screen.findByText('部分詞')
    openFilters()

    fireEvent.click(screen.getByRole('button', { name: 'Fully recorded' }))

    expect(localStorage.getItem('teochew-dictionary:flashcard-full-audio-only')).toBe('true')
    expect(await screen.findByText('No recordings for these cards yet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Drop the recording filter' }))
    expect(await screen.findByText('部分詞')).toBeInTheDocument()
  })

  it('keeps a fully recorded entry under the recording filter', async () => {
    const full = makeEntry({ id: 'full', headword: '全錄詞', readings: [makeReading({ audio: [CLIP, CLIP] })] })
    localStorage.setItem('teochew-dictionary:flashcard-full-audio-only', 'true')
    render(<FlashcardsView entries={[full]} />)
    expect(await screen.findByText('全錄詞')).toBeInTheDocument()
  })

  it('persists the tone setting', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Citation' }))
    expect(localStorage.getItem('teochew-dictionary:pronunciation-mode')).toBe('citation')
  })
})

describe('FlashcardsView active filter chips', () => {
  it('shows none while every filter is at its default', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    expect(screen.queryByRole('button', { name: /^Remove filter/ })).not.toBeInTheDocument()
  })

  it('echoes a narrowed level filter, and clears it when the chip is removed', async () => {
    const a1 = makeEntry({ id: 'a1', headword: 'A1詞', level: 'A1' })
    render(<FlashcardsView entries={[a1]} />)
    await screen.findByText('A1詞')
    openFilters()
    fireEvent.click(level('A2'))

    fireEvent.click(screen.getByRole('button', { name: /Remove filter/ }))

    expect(screen.queryByRole('button', { name: /Remove filter/ })).not.toBeInTheDocument()
  })

  it('badges how many filters are applied', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Fully recorded' }))
    expect(screen.getByLabelText('1 active')).toBeInTheDocument()
  })

  it('counts citation as the deliberate choice, since sandhi is this app default', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)
    expect(screen.queryByText('sandhi tones')).not.toBeInTheDocument()

    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Citation' }))
    expect(screen.getByText('citation tones')).toBeInTheDocument()
  })
})

describe('FlashcardsView the table', () => {
  it('starts with the dictionary in play', async () => {
    const { container } = render(<FlashcardsView entries={[ENTRY, makeEntry({ id: 'b' })]} />)
    await screen.findByText(/reviewed/)
    const tray = container.querySelector<HTMLElement>('.tray')!
    expect(within(tray).getByText('Dictionary')).toBeInTheDocument()
  })

  it('sums the pool across every deck on the table', async () => {
    const { container } = render(<FlashcardsView entries={[ENTRY, makeEntry({ id: 'b' })]} />)
    await screen.findByText(/reviewed/)
    const totals = within(container.querySelector<HTMLElement>('.table__totals')!)
    expect(totals.getByText('cards from 1 deck')).toBeInTheDocument()
    expect(totals.getByText('2 new')).toBeInTheDocument()
  })

  it('unions in-play decks, reviewing a card in two decks only once', async () => {
    writeDecksState({
      decks: [
        { id: 'deck-a', name: 'A', hue: 'green', cards: ['shared', 'only-a'], kind: 'user' },
        { id: 'deck-b', name: 'B', hue: 'red', cards: ['shared', 'only-b'], kind: 'user' },
      ],
      inPlay: ['deck-a', 'deck-b'],
      groups: [],
    })
    render(
      <FlashcardsView
        entries={[
          makeEntry({ id: 'shared', headword: '共用' }),
          makeEntry({ id: 'only-a', headword: '甲' }),
          makeEntry({ id: 'only-b', headword: '乙' }),
        ]}
      />,
    )
    expect(await screen.findByText('3 left in this session · drawn from 2 decks on the table', { exact: false })).toBeInTheDocument()
  })

  it('takes a deck off the table and persists it', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: 'Take Kitchen off the table' }))

    expect(screen.queryByRole('button', { name: 'Take Kitchen off the table' })).not.toBeInTheDocument()
    expect(readDecksState().inPlay).toEqual([DICTIONARY_DECK_ID])
  })

  it('offers to undo taking a deck off the table', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: [], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: 'Take Kitchen off the table' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(readDecksState().inPlay).toEqual([DICTIONARY_DECK_ID, 'deck-1'])
  })

  it('explains an empty table and offers the dictionary as the way out', async () => {
    writeDecksState({ decks: [], inPlay: [], groups: [] })
    render(<FlashcardsView entries={[ENTRY]} />)

    expect(await screen.findByText('The table is empty')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Put the Dictionary in play' }))
    expect(await screen.findByText('潮州')).toBeInTheDocument()
  })

  it('treats a table holding only an empty deck as an empty table', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Empty Deck', hue: 'green', cards: [], kind: 'user' }],
      inPlay: ['deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[ENTRY]} />)
    expect(await screen.findByText('The table is empty')).toBeInTheDocument()
  })
})

describe('FlashcardsView the library', () => {
  it('creates a deck and drops straight into naming it', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: '+ New' }))

    const input = screen.getByLabelText('New name for New deck')
    fireEvent.change(input, { target: { value: 'Kitchen' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(readDecksState().decks.map((d) => d.name)).toEqual(['Kitchen'])
  })

  it('duplicates a deck, cards and all, with an undo', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['a'], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID],
      groups: [],
    })
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: 'Options for Kitchen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))

    expect(readDecksState().decks.map((d) => d.name)).toEqual(['Kitchen', 'Kitchen copy'])

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(readDecksState().decks.map((d) => d.name)).toEqual(['Kitchen'])
  })

  it('deletes a deck immediately, and the toast puts it back', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['a'], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID],
      groups: [],
    })
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: 'Options for Kitchen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(readDecksState().decks).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(readDecksState().decks.map((d) => d.name)).toEqual(['Kitchen'])
  })

  it('puts a deck on the table from its options menu', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['a'], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID],
      groups: [],
    })
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: 'Options for Kitchen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Put on the table' }))

    expect(readDecksState().inPlay).toEqual([DICTIONARY_DECK_ID, 'deck-1'])
  })
})

describe('FlashcardsView saved groups', () => {
  it('saves the table, loads it back, and can undo the load', async () => {
    writeDecksState({
      decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['a'], kind: 'user' }],
      inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
      groups: [],
    })
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: '+ Save this table' }))
    const input = screen.getByLabelText('Name this group')
    fireEvent.change(input, { target: { value: 'Morning drill' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(readDecksState().groups.map((g) => g.name)).toEqual(['Morning drill'])

    fireEvent.click(screen.getByRole('button', { name: 'Take Kitchen off the table' }))
    fireEvent.click(screen.getByRole('button', { name: 'Morning drill' }))
    expect(readDecksState().inPlay).toEqual([DICTIONARY_DECK_ID, 'deck-1'])
  })
})

describe('FlashcardsView the browse drawer', () => {
  it('opens and closes from the session bar', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: '＋ Add cards' }))
    expect(screen.getByLabelText('Search the dictionary')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '✕ Done adding' }))
    expect(screen.getByRole('button', { name: '＋ Add cards' })).toBeInTheDocument()
  })

  it('saves the filtered pool as a deck', async () => {
    render(<FlashcardsView entries={[ENTRY]} />)
    await screen.findByText(/reviewed/)

    fireEvent.click(screen.getByRole('button', { name: '＋ Add cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save this pool as a deck' }))

    const decks = readDecksState().decks
    expect(decks).toHaveLength(1)
    expect(decks[0]!.cards).toEqual(['a'])
    expect(decks[0]!.name).toBe('Pool · Chinese')
  })
})

describe('FlashcardsView the funnel', () => {
  it('reports what survived, and opens the filters from the stage that cut', async () => {
    const a1 = makeEntry({ id: 'a1', headword: 'A1詞', level: 'A1' })
    const b1 = makeEntry({ id: 'b1', headword: 'B1詞', level: 'B1' })
    localStorage.setItem('teochew-dictionary:flashcard-level-filter', 'A1')
    render(<FlashcardsView entries={[a1, b1]} />)
    await screen.findByText('A1詞')

    expect(screen.getByText('in play')).toBeInTheDocument()
    expect(screen.getByText('to review')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /level/ }))
    expect(screen.getByText('Tones shown')).toBeInTheDocument()
  })
})

/*
 * The drawn card is the one thing on this screen with continuity: it should
 * survive anything that doesn't invalidate it, and each table should keep its
 * own. Progress is asserted alongside the headword because a rebuilt queue
 * used to reset the reviewed count, which pins the regression precisely
 * whatever the shuffle happens to deal.
 */
describe('FlashcardsView the drawn card', () => {
  const deck = (cards: string[] = []) => ({ id: 'deck-1', name: 'Kitchen', hue: 'green' as const, cards, kind: 'user' as const })
  const entries = [
    makeEntry({ id: 'e1', headword: '一', frequency: 30 }),
    makeEntry({ id: 'e2', headword: '二', frequency: 20 }),
    makeEntry({ id: 'e3', headword: '三', frequency: 10 }),
  ]

  async function reviewOne() {
    fireEvent.click(await screen.findByText('Show answer'))
    fireEvent.click(screen.getByRole('button', { name: /Good/ }))
  }

  it('stays put when a deck that is not even on the table is renamed', async () => {
    writeDecksState({ decks: [deck()], inPlay: [DICTIONARY_DECK_ID], groups: [] })
    render(<FlashcardsView entries={entries} />)
    await reviewOne()

    const showing = screen.getByText('二')

    fireEvent.click(screen.getByRole('button', { name: 'Options for Kitchen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByLabelText('New name for Kitchen')
    fireEvent.change(input, { target: { value: 'Market' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(showing).toBeInTheDocument()
    expect(screen.getByText(/1 reviewed/)).toBeInTheDocument()
  })

  it('stays put when a deck is duplicated', async () => {
    writeDecksState({ decks: [deck()], inPlay: [DICTIONARY_DECK_ID], groups: [] })
    render(<FlashcardsView entries={entries} />)
    await reviewOne()

    fireEvent.click(screen.getByRole('button', { name: 'Options for Kitchen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))

    expect(screen.getByText('二')).toBeInTheDocument()
    expect(screen.getByText(/1 reviewed/)).toBeInTheDocument()
  })

  it('stays put when a filter it still passes changes', async () => {
    writeDecksState({ decks: [], inPlay: [DICTIONARY_DECK_ID], groups: [] })
    render(<FlashcardsView entries={entries} />)
    await reviewOne()

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Citation' }))

    expect(screen.getByText('二')).toBeInTheDocument()
    expect(screen.getByText(/1 reviewed/)).toBeInTheDocument()
  })

  it('gives way when a filter makes it ineligible', async () => {
    const levelled = [
      makeEntry({ id: 'e1', headword: '一', level: 'A1', frequency: 30 }),
      makeEntry({ id: 'e2', headword: '二', level: 'B1', frequency: 20 }),
    ]
    writeDecksState({ decks: [], inPlay: [DICTIONARY_DECK_ID], groups: [] })
    render(<FlashcardsView entries={levelled} />)
    expect(await screen.findByText('一')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    fireEvent.click(screen.getByRole('button', { name: /^A1$/ }))

    expect(screen.queryByText('一')).not.toBeInTheDocument()
    expect(screen.getByText('二')).toBeInTheDocument()
  })

  it('keeps a card per table, and resumes each where it was left', async () => {
    writeDecksState({ decks: [deck(['e3'])], inPlay: [DICTIONARY_DECK_ID], groups: [] })
    render(<FlashcardsView entries={entries} />)
    await reviewOne()
    expect(screen.getByText('二')).toBeInTheDocument()

    // A second table: the dictionary plus Kitchen. It starts its own session,
    // so it has reviewed nothing even though the first table has.
    fireEvent.click(screen.getByRole('button', { name: 'Options for Kitchen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Put on the table' }))
    expect(screen.getByText(/0 reviewed/)).toBeInTheDocument()

    // Back to the first table.
    fireEvent.click(screen.getByRole('button', { name: 'Take Kitchen off the table' }))
    expect(screen.getByText('二')).toBeInTheDocument()
    expect(screen.getByText(/1 reviewed/)).toBeInTheDocument()
  })

  it('treats a reordered table as the same table, not a new one', async () => {
    writeDecksState({ decks: [deck(['e3'])], inPlay: [DICTIONARY_DECK_ID, 'deck-1'], groups: [] })
    render(<FlashcardsView entries={entries} />)
    await reviewOne()
    expect(screen.getByText('二')).toBeInTheDocument()

    // Lift the Kitchen chip and move it to the front. The decks on the table
    // are the same ones, so the session should carry straight on.
    const chip = screen.getByRole('button', { name: /^Kitchen on the table/ })
    fireEvent.keyDown(chip, { key: ' ' })
    fireEvent.keyDown(chip, { key: 'ArrowLeft' })

    expect(readDecksState().inPlay).toEqual(['deck-1', DICTIONARY_DECK_ID])
    expect(screen.getByText('二')).toBeInTheDocument()
    expect(screen.getByText(/1 reviewed/)).toBeInTheDocument()
  })

  it('starts a fresh session when the table is genuinely different', async () => {
    writeDecksState({ decks: [deck(['e3'])], inPlay: [DICTIONARY_DECK_ID], groups: [] })
    render(<FlashcardsView entries={entries} />)
    await reviewOne()
    expect(screen.getByText(/1 reviewed/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Options for Kitchen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Put on the table' }))

    expect(screen.getByText(/0 reviewed/)).toBeInTheDocument()
  })
})
