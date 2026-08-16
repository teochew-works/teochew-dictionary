import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlashcardsView } from './FlashcardsView'

describe('FlashcardsView', () => {
  it('shows a "nothing due" state when there are no entries to review', async () => {
    render(<FlashcardsView entries={[]} />)
    expect(await screen.findByText(/nothing due/i)).toBeInTheDocument()
  })
})
