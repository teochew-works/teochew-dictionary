import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Drawer } from './Drawer'

describe('Drawer', () => {
  it('stays mounted while closed, which is what lets it animate', () => {
    const { container } = render(
      <Drawer open={false} label="Browse the dictionary">
        <p>body</p>
      </Drawer>,
    )
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(container.querySelector('.drawer--open')).toBeNull()
  })

  it('takes its closed content out of the tab order, rather than merely hiding it', () => {
    const { container } = render(
      <Drawer open={false} label="Browse the dictionary">
        <button type="button">focusable</button>
      </Drawer>,
    )
    // aria-hidden alone would leave the button tabbable inside hidden content.
    expect(container.querySelector('.drawer')).toHaveAttribute('inert')
    expect(container.querySelector('.drawer')).not.toHaveAttribute('aria-hidden')
  })

  it('opens, and drops the inert marking with it', () => {
    const { container } = render(
      <Drawer open label="Browse the dictionary">
        <p>body</p>
      </Drawer>,
    )
    expect(container.querySelector('.drawer--open')).not.toBeNull()
    expect(container.querySelector('.drawer')).not.toHaveAttribute('inert')
  })

  it('is named by its caller, so a deck announces as its own cards', () => {
    render(
      <Drawer open label="Cards in Kitchen">
        <p>body</p>
      </Drawer>,
    )
    expect(screen.getByRole('region', { name: 'Cards in Kitchen' })).toBeInTheDocument()
  })

  /*
   * Phone width turns the dock into a bottom sheet (mobile.md §3.4) — the
   * handle across its top edge is how it's dismissed without reaching back
   * up to whatever opened it. Omitted where a caller has nothing to close to.
   */
  it('offers a close handle when given onClose, and none otherwise', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Drawer open label="Browse the dictionary" onClose={onClose}>
        <p>body</p>
      </Drawer>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close Browse the dictionary' }))
    expect(onClose).toHaveBeenCalled()

    rerender(
      <Drawer open label="Browse the dictionary">
        <p>body</p>
      </Drawer>,
    )
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument()
  })
})
