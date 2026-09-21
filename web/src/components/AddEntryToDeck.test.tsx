import { afterEach, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AddEntryToDeck } from './AddEntryToDeck'
import { readDecksState } from '../decks/storage'

afterEach(() => localStorage.clear())
it('creates a deck with the selected entry without dragging', () => {
  render(<AddEntryToDeck entryId="word-1" />)
  fireEvent.click(screen.getByText('Add to deck'))
  fireEvent.change(screen.getByLabelText('New deck name'), { target: { value: 'Everyday words' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add word' }))
  const saved = readDecksState()
  expect(saved.decks[0]?.cards).toEqual(['word-1'])
  expect(saved.decks[0]?.name).toBe('Everyday words')
  expect(screen.getByRole('link', { name: 'Study this deck' })).toHaveAttribute('href', '#flashcards')
})
