import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeckMenu } from './DeckMenu'

function actions() {
  return { onPutOnTable: vi.fn(), onRename: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() }
}

function open(inPlay = false) {
  const a = actions()
  render(<DeckMenu deckName="Travel" inPlay={inPlay} actions={a} />)
  fireEvent.click(screen.getByRole('button', { name: 'Options for Travel' }))
  return a
}

describe('DeckMenu', () => {
  it('is closed until the kebab is pressed', () => {
    render(<DeckMenu deckName="Travel" inPlay={false} actions={actions()} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers put-on-table, rename, duplicate, and delete', () => {
    open()
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Put on the table',
      'Rename',
      'Duplicate',
      'Delete',
    ])
  })

  it('disables putting a deck on the table when it is already there', () => {
    open(true)
    expect(screen.getByRole('menuitem', { name: 'Put on the table' })).toBeDisabled()
  })

  it('runs the chosen action and closes', () => {
    const a = open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(a.onDuplicate).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('deletes without asking first — the toast carries the undo', () => {
    const a = open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(a.onDelete).toHaveBeenCalled()
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on a press outside it', () => {
    open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
