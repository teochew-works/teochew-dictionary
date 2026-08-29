import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StudyEmptyState } from './StudyEmptyState'

describe('StudyEmptyState', () => {
  it('names the reason and the fix', () => {
    render(<StudyEmptyState title="The table is empty" body="Drag a deck out of the library." fixLabel="Put the Dictionary in play" onFix={vi.fn()} />)
    expect(screen.getByText('The table is empty')).toBeInTheDocument()
    expect(screen.getByText('Drag a deck out of the library.')).toBeInTheDocument()
  })

  it('runs the fix when it is taken', () => {
    const onFix = vi.fn()
    render(<StudyEmptyState title="t" body="b" fixLabel="Fix it" onFix={onFix} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }))
    expect(onFix).toHaveBeenCalled()
  })

  it('omits the button when there is nothing to offer', () => {
    render(<StudyEmptyState title="Table cleared" body="Come back tomorrow." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
