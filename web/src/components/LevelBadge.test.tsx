import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LevelBadge } from './LevelBadge'

describe('LevelBadge', () => {
  afterEach(cleanup)

  it('renders the level text', () => {
    render(<LevelBadge level="A2" />)
    expect(screen.getByText('A2')).toBeInTheDocument()
  })
})
