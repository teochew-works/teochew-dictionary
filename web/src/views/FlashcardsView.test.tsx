import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FlashcardsView } from './FlashcardsView'
import { makeEntry } from '../test/entryFixtures'

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
