import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { DragGhost } from './DragGhost'

describe('DragGhost', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders nothing when position is null', () => {
    const { container } = render(<DragGhost position={null} label="Kitchen" outcomeText="Move here" refused={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the label and outcome badge when dragging', () => {
    render(<DragGhost position={{ x: 10, y: 20, angle: 5 }} label="Kitchen" outcomeText="+3 cards" refused={false} />)
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('+3 cards')).toBeInTheDocument()
  })

  it('disappears immediately when the drag ends without being refused', () => {
    const { rerender, container } = render(
      <DragGhost position={{ x: 10, y: 20, angle: 5 }} label="Kitchen" outcomeText="Move here" refused={false} />,
    )
    rerender(<DragGhost position={null} label="Kitchen" outcomeText="Move here" refused={false} />)
    expect(container.firstChild).toBeNull()
  })

  describe('refusal', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('holds the ghost with the refused class briefly, then removes it', () => {
      const { rerender, container } = render(
        <DragGhost position={{ x: 10, y: 20, angle: 5 }} label="Kitchen" outcomeText="Can't drop here" refused={true} />,
      )
      rerender(<DragGhost position={null} label="Kitchen" outcomeText="Can't drop here" refused={true} />)

      expect(container.querySelector('.drag-ghost--refused')).not.toBeNull()

      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(container.firstChild).toBeNull()
    })
  })
})
