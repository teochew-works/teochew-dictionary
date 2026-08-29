import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Flashcard } from './Flashcard'
import { makeEntry, makeReading } from '../test/entryFixtures'
import type { AudioReference } from '../types/dict'
import type { Deck } from '../decks/types'

const WORD_CLIP: AudioReference = {
  key: 'dio5 ziu1',
  url: 'https://example.com/dio5-ziu1.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: [],
}

const ENTRY = makeEntry()
const ENTRY_WITH_AUDIO = makeEntry({ readings: [makeReading({ wordAudio: WORD_CLIP })] })
const DECK: Deck = { id: 'd1', name: 'Kitchen & market', hue: 'green', kind: 'user', cards: ['dio5-ziu1-潮州'] }
const INTERVALS = { again: 1, good: 6, easy: 8 }

function card(overrides: Partial<Parameters<typeof Flashcard>[0]> = {}) {
  return render(
    <Flashcard
      entry={ENTRY}
      mode="chinese"
      pronunciation="citation"
      sourceDeck={null}
      intervals={INTERVALS}
      filing={null}
      onGrade={vi.fn()}
      {...overrides}
    />,
  )
}

function reveal() {
  fireEvent.click(screen.getByText('Show answer'))
}

describe('Flashcard prompt modes', () => {
  afterEach(cleanup)

  it('chinese: prompts with the headword, and the answer adds reading and gloss', () => {
    card()
    expect(screen.getByText('潮州')).toBeInTheDocument()
    expect(screen.queryByText('dio5 ziu1')).not.toBeInTheDocument()

    reveal()
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()
    expect(screen.getAllByText('潮州')).toHaveLength(1)
  })

  it('english: prompts with the gloss, and the answer adds the headword', () => {
    card({ mode: 'english' })
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()

    reveal()
    expect(screen.getByText('潮州')).toBeInTheDocument()
    expect(screen.getAllByText('Chaozhou, Teochew')).toHaveLength(1)
  })

  it('pronunciation: prompts with the reading, and does not repeat it in the answer', () => {
    card({ mode: 'pronunciation' })
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()

    reveal()
    expect(screen.getAllByText('dio5 ziu1')).toHaveLength(1)
    expect(screen.getByText('潮州')).toBeInTheDocument()
  })

  it('follows the sandhi setting in the reading it shows', () => {
    card({ mode: 'pronunciation', pronunciation: 'sandhi' })
    expect(screen.getByText('dio7 ziu1')).toBeInTheDocument()
  })

  it('audio-only: prompts with the clip alone', () => {
    card({ entry: ENTRY_WITH_AUDIO, mode: 'audio-only' })
    expect(screen.queryByText('潮州')).not.toBeInTheDocument()
    reveal()
    expect(screen.getByText('潮州')).toBeInTheDocument()
  })
})

describe('Flashcard', () => {
  afterEach(cleanup)

  it('names the deck the card was drawn from', () => {
    card({ sourceDeck: DECK })
    expect(screen.getByText('Kitchen & market')).toBeInTheDocument()
  })

  it('falls back to the dictionary when no deck on the table claims the card', () => {
    card()
    expect(screen.getByText('Dictionary')).toBeInTheDocument()
  })

  it('shows the real interval each grade would schedule', () => {
    card()
    reveal()
    expect(screen.getByRole('button', { name: /Again/ })).toHaveTextContent('1d')
    expect(screen.getByRole('button', { name: /Good/ })).toHaveTextContent('6d')
    expect(screen.getByRole('button', { name: /Easy/ })).toHaveTextContent('8d')
  })

  it('grades and re-hides the answer for the next card', () => {
    const onGrade = vi.fn()
    card({ onGrade })
    reveal()
    fireEvent.click(screen.getByRole('button', { name: /Good/ }))
    expect(onGrade).toHaveBeenCalledWith('good')
    expect(screen.getByText('Show answer')).toBeInTheDocument()
  })

  it('reveals on Space and grades on 1/2/3, so a session needs no pointer', () => {
    const onGrade = vi.fn()
    card({ onGrade })

    fireEvent.keyDown(document.body, { key: ' ' })
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: '3' })
    expect(onGrade).toHaveBeenCalledWith('easy')
  })

  it('stands its shortcuts down while focus is in a text field', () => {
    card()
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: ' ' })
    expect(screen.getByText('Show answer')).toBeInTheDocument()
    input.remove()
  })

  const filing = (overrides: Record<string, unknown> = {}) => ({
    onPointerDown: vi.fn(),
    dragging: false,
    menuOpen: false,
    onOpenMenu: vi.fn(),
    menu: null,
    ...overrides,
  })

  it('has no filing handle when the caller offers none', () => {
    card()
    expect(screen.queryByLabelText(/潮州 into a deck/)).not.toBeInTheDocument()
  })

  it('starts a filing drag from the handle', () => {
    const onPointerDown = vi.fn()
    card({ filing: filing({ onPointerDown }) })
    fireEvent.pointerDown(screen.getByLabelText('File 潮州 into a deck'), { button: 0 })
    expect(onPointerDown).toHaveBeenCalled()
  })

  it('opens the membership menu when the handle is pressed, so the drag has a keyboard path', () => {
    const onOpenMenu = vi.fn()
    card({ filing: filing({ onOpenMenu }) })
    fireEvent.click(screen.getByLabelText('File 潮州 into a deck'))
    expect(onOpenMenu).toHaveBeenCalled()
  })

  it('announces the handle as a menu trigger', () => {
    card({ filing: filing() })
    const handle = screen.getByLabelText('File 潮州 into a deck')
    expect(handle).toHaveAttribute('aria-haspopup', 'menu')
    expect(handle).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders the menu the caller hands it', () => {
    card({ filing: filing({ menuOpen: true, menu: <p>membership menu</p> }) })
    expect(screen.getByText('membership menu')).toBeInTheDocument()
    expect(screen.getByLabelText('File 潮州 into a deck')).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows the handle as active while the card is in the air', () => {
    const { container } = card({ filing: filing({ dragging: true }) })
    expect(container.querySelector('.card__filing--dragging')).not.toBeNull()
  })
})
