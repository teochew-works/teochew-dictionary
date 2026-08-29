import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GroupPresets } from './GroupPresets'
import type { DeckGroup } from '../decks/types'

const GROUPS: DeckGroup[] = [
  { id: 'g1', name: 'Evenings', deckIds: ['a'] },
  { id: 'g2', name: 'Weekend', deckIds: ['b'] },
]

describe('GroupPresets', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('disables the load select when there are no groups', () => {
    render(<GroupPresets groups={[]} currentInPlay={['a']} onSave={vi.fn()} onLoad={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByLabelText('Load a saved group')).toBeDisabled()
  })

  it('lists every saved group as a load option', () => {
    render(<GroupPresets groups={GROUPS} currentInPlay={['a']} onSave={vi.fn()} onLoad={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('option', { name: 'Evenings' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Weekend' })).toBeInTheDocument()
  })

  it('calls onLoad with the selected group id', () => {
    const onLoad = vi.fn()
    render(<GroupPresets groups={GROUPS} currentInPlay={['a']} onSave={vi.fn()} onLoad={onLoad} onDelete={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Load a saved group'), { target: { value: 'g2' } })

    expect(onLoad).toHaveBeenCalledWith('g2')
  })

  it('disables saving when the table is empty', () => {
    render(<GroupPresets groups={[]} currentInPlay={[]} onSave={vi.fn()} onLoad={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Save table as group…')).toBeDisabled()
  })

  it('saves the table under the inline-input name', () => {
    const onSave = vi.fn()
    render(<GroupPresets groups={[]} currentInPlay={['a', 'b']} onSave={onSave} onLoad={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByText('Save table as group…'))
    const input = screen.getByLabelText('Name this group')
    fireEvent.change(input, { target: { value: 'Evenings' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSave).toHaveBeenCalledWith('Evenings')
    expect(screen.queryByLabelText('Name this group')).not.toBeInTheDocument()
  })

  it('does not save when the input is cancelled or blank', () => {
    const onSave = vi.fn()
    render(<GroupPresets groups={[]} currentInPlay={['a']} onSave={onSave} onLoad={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByText('Save table as group…'))
    fireEvent.keyDown(screen.getByLabelText('Name this group'), { key: 'Escape' })
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Name this group')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Save table as group…'))
    const input = screen.getByLabelText('Name this group')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('deletes a group after confirming via DeleteConfirm', () => {
    const onDelete = vi.fn()
    render(<GroupPresets groups={GROUPS} currentInPlay={['a']} onSave={vi.fn()} onLoad={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('Delete group Evenings'))
    fireEvent.click(screen.getByLabelText('Confirm deleting group Evenings'))

    expect(onDelete).toHaveBeenCalledWith('g1')
  })

  it('does not delete a group when the confirmation is cancelled', () => {
    const onDelete = vi.fn()
    render(<GroupPresets groups={GROUPS} currentInPlay={['a']} onSave={vi.fn()} onLoad={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(screen.getByLabelText('Delete group Evenings'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(onDelete).not.toHaveBeenCalled()
  })
})
