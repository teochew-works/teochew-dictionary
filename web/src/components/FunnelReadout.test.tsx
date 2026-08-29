import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FunnelReadout } from './FunnelReadout'
import type { FunnelStage } from './FunnelReadout'

const stages: FunnelStage[] = [
  { key: 'in-play', label: 'in play', count: 1248, variant: 'start' },
  { key: 'level', label: 'level', count: 892, variant: 'cut' },
  { key: 'queue', label: 'to review', count: 34, variant: 'out' },
]

describe('FunnelReadout', () => {
  it('shows each stage as a count and a label', () => {
    render(<FunnelReadout stages={stages} onOpenFilters={vi.fn()} />)
    expect(screen.getByText('1,248')).toBeInTheDocument()
    expect(screen.getByText('in play')).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
  })

  it('makes only the stages a filter cut clickable', () => {
    render(<FunnelReadout stages={stages} onOpenFilters={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveTextContent('level')
  })

  it('opens the filters from the stage that cut the pool', () => {
    const onOpenFilters = vi.fn()
    render(<FunnelReadout stages={stages} onOpenFilters={onOpenFilters} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onOpenFilters).toHaveBeenCalled()
  })

  it('renders a single stage without a cut', () => {
    render(<FunnelReadout stages={[stages[0]!]} onOpenFilters={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
