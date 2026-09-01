import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GroupPresets } from './GroupPresets'
import type { Deck, DeckGroup } from '@teochew/core'

const decksById = new Map<string, Deck>([
  ['d1', { id: 'd1', name: 'Core 100', hue: 'teal', kind: 'user', cards: [] }],
  ['d2', { id: 'd2', name: 'Kitchen', hue: 'green', kind: 'user', cards: [] }],
])
const groups: DeckGroup[] = [{ id: 'g1', name: 'Morning drill', deckIds: ['d1', 'd2'] }]

function setup(overrides: Partial<Parameters<typeof GroupPresets>[0]> = {}) {
  const props = {
    groups,
    decksById,
    currentInPlay: ['d1'],
    onSave: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  const view = render(<GroupPresets {...props} />)
  return { ...view, props }
}

describe('GroupPresets', () => {
  it('names each saved table', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Morning drill' })).toBeInTheDocument()
  })

  it('carries a swatch per deck, so a group is recognisable before it is read', () => {
    const { container } = setup()
    expect(container.querySelectorAll('.group__swatches i')).toHaveLength(2)
  })

  it('lists its decks in the tooltip', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Morning drill' })).toHaveAttribute('title', 'Core 100 + Kitchen')
  })

  it('marks the group that matches the table right now, whatever the order', () => {
    setup({ currentInPlay: ['d2', 'd1'] })
    expect(screen.getByRole('button', { name: 'Morning drill' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is unpressed when the table has drifted from every group', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Morning drill' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('loads a group in one press', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Morning drill' }))
    expect(props.onLoad).toHaveBeenCalledWith('g1')
  })

  it('deletes a group without a confirmation step', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete group Morning drill' }))
    expect(props.onDelete).toHaveBeenCalledWith('g1')
  })

  describe('saving the current table', () => {
    it('names it with an inline input rather than a browser prompt', () => {
      setup()
      fireEvent.click(screen.getByRole('button', { name: '+ Save this table' }))
      expect(screen.getByLabelText('Name this group')).toBeInTheDocument()
    })

    it('saves on Enter', () => {
      const { props } = setup()
      fireEvent.click(screen.getByRole('button', { name: '+ Save this table' }))
      const input = screen.getByLabelText('Name this group')
      fireEvent.change(input, { target: { value: 'Evening' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(props.onSave).toHaveBeenCalledWith('Evening')
    })

    it('trims the name', () => {
      const { props } = setup()
      fireEvent.click(screen.getByRole('button', { name: '+ Save this table' }))
      const input = screen.getByLabelText('Name this group')
      fireEvent.change(input, { target: { value: '  Evening  ' } })
      fireEvent.blur(input)
      expect(props.onSave).toHaveBeenCalledWith('Evening')
    })

    it('saves nothing for a blank name', () => {
      const { props } = setup()
      fireEvent.click(screen.getByRole('button', { name: '+ Save this table' }))
      fireEvent.blur(screen.getByLabelText('Name this group'))
      expect(props.onSave).not.toHaveBeenCalled()
    })

    it('abandons the name on Escape', () => {
      const { props } = setup()
      fireEvent.click(screen.getByRole('button', { name: '+ Save this table' }))
      const input = screen.getByLabelText('Name this group')
      fireEvent.change(input, { target: { value: 'Evening' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(props.onSave).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Name this group')).not.toBeInTheDocument()
    })

    it('cannot save an empty table', () => {
      setup({ currentInPlay: [] })
      expect(screen.getByRole('button', { name: '+ Save this table' })).toBeDisabled()
    })
  })
})
