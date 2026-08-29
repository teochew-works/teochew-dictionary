import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FunnelReadout } from './FunnelReadout'

describe('FunnelReadout', () => {
  it('renders a single stage with its label', () => {
    render(<FunnelReadout stages={[{ key: 'in-play', count: 34 }]} />)
    expect(screen.getByText('34 in play')).toBeInTheDocument()
  })

  it('joins multiple stages with an arrow, in order', () => {
    render(
      <FunnelReadout
        stages={[
          { key: 'in-play', count: 1248 },
          { key: 'level', count: 892 },
          { key: 'audio', count: 611 },
          { key: 'queue', count: 34 },
        ]}
      />,
    )
    expect(screen.getByText('1,248 in play → 892 level → 611 audio → 34 to review')).toBeInTheDocument()
  })

  it('formats large counts with thousands separators', () => {
    render(<FunnelReadout stages={[{ key: 'in-play', count: 16245 }]} />)
    expect(screen.getByText('16,245 in play')).toBeInTheDocument()
  })
})
