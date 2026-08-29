import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FiltersPopover } from './FiltersPopover'

describe('FiltersPopover', () => {
  it('starts closed, with its content not in the document', () => {
    render(
      <FiltersPopover>
        <p>Panel content</p>
      </FiltersPopover>,
    )
    expect(screen.queryByText('Panel content')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens on trigger click', () => {
    render(
      <FiltersPopover>
        <p>Panel content</p>
      </FiltersPopover>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    expect(screen.getByText('Panel content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('toggles closed on a second trigger click', () => {
    render(
      <FiltersPopover>
        <p>Panel content</p>
      </FiltersPopover>,
    )
    const trigger = screen.getByRole('button', { name: 'Filters' })

    fireEvent.click(trigger)
    fireEvent.click(trigger)

    expect(screen.queryByText('Panel content')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(
      <FiltersPopover>
        <p>Panel content</p>
      </FiltersPopover>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText('Panel content')).not.toBeInTheDocument()
  })

  it('closes on a click outside the panel and trigger', () => {
    render(
      <FiltersPopover>
        <p>Panel content</p>
      </FiltersPopover>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    fireEvent.mouseDown(document.body)

    expect(screen.queryByText('Panel content')).not.toBeInTheDocument()
  })

  it('does not close on a click inside the panel', () => {
    render(
      <FiltersPopover>
        <p>Panel content</p>
      </FiltersPopover>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    fireEvent.mouseDown(screen.getByText('Panel content'))

    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })
})
