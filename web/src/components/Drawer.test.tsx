import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
