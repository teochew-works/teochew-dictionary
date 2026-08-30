import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FiltersPopover } from './FiltersPopover'

function setup(open: boolean, activeCount = 0) {
  const onOpenChange = vi.fn()
  render(
    <FiltersPopover open={open} onOpenChange={onOpenChange} activeCount={activeCount}>
      <p>panel body</p>
    </FiltersPopover>,
  )
  return { onOpenChange }
}

describe('FiltersPopover', () => {
  it('keeps the panel unmounted while closed', () => {
    setup(false)
    expect(screen.queryByText('panel body')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the panel when the caller says it is open', () => {
    setup(true)
    expect(screen.getByText('panel body')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Filters/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('asks the caller to open and to close', () => {
    const { onOpenChange } = setup(false)
    fireEvent.click(screen.getByRole('button'))
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('badges the number of filters actually applied', () => {
    setup(false, 2)
    expect(screen.getByLabelText('2 active')).toHaveTextContent('2')
  })

  it('shows no badge when nothing is filtered', () => {
    setup(false, 0)
    expect(screen.queryByLabelText(/active/)).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const { onOpenChange } = setup(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on a press outside the panel and trigger', () => {
    const { onOpenChange } = setup(true)
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays open for a press inside the panel', () => {
    const { onOpenChange } = setup(true)
    fireEvent.pointerDown(screen.getByText('panel body'))
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
