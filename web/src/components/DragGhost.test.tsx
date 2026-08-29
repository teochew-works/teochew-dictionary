import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DragGhost } from './DragGhost'
import type { DropOutcome } from '../decks/dnd/resolveDrop'

const content = { title: 'Food words', subtitle: '18 cards', hue: 'rebeccapurple' }
const frame = { x: 120, y: 240, angle: 4 }
const accepted: DropOutcome = { ok: true, act: 'play', index: 0, highlight: 'tray', label: '+18 cards' }
const refused: DropOutcome = { ok: false, act: null, highlight: 'deck', label: 'The dictionary is read-only' }
const deleting: DropOutcome = { ok: true, act: 'delete', highlight: 'trash', label: 'Delete deck' }

describe('DragGhost', () => {
  it('renders nothing when no drag is in flight', () => {
    const { container } = render(<DragGhost frame={null} size={null} content={content} outcome={null} rejecting={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows what is being dragged', () => {
    render(<DragGhost frame={frame} size={null} content={content} outcome={accepted} rejecting={false} />)
    expect(screen.getByText('Food words')).toBeInTheDocument()
    expect(screen.getByText('18 cards')).toBeInTheDocument()
  })

  it('names the outcome on the badge', () => {
    render(<DragGhost frame={frame} size={null} content={content} outcome={accepted} rejecting={false} />)
    expect(screen.getByText('+18 cards')).toBeInTheDocument()
  })

  it('positions and tilts by the frame it is given', () => {
    const { container } = render(<DragGhost frame={frame} size={{ width: 200, height: 60 }} content={content} outcome={accepted} rejecting={false} />)
    const ghost = container.querySelector('.ghost') as HTMLElement
    expect(ghost.style.transform).toContain('translate3d(120.0px, 240.0px, 0)')
    expect(ghost.style.transform).toContain('rotate(4.00deg)')
    expect(ghost.style.width).toBe('200px')
  })

  it('flips the badge to a refusal when the target says no', () => {
    const { container } = render(<DragGhost frame={frame} size={null} content={content} outcome={refused} rejecting={false} />)
    expect(container.querySelector('.ghost__badge--no')).not.toBeNull()
    expect(screen.getByText('The dictionary is read-only')).toBeInTheDocument()
  })

  it('marks a delete distinctly from an ordinary accept', () => {
    const { container } = render(<DragGhost frame={frame} size={null} content={content} outcome={deleting} rejecting={false} />)
    expect(container.querySelector('.ghost__badge--del')).not.toBeNull()
  })

  it('bounces rather than vanishing when a drag ends on a refusal', () => {
    const { container } = render(<DragGhost frame={frame} size={null} content={content} outcome={refused} rejecting />)
    expect(container.querySelector('.ghost--reject')).not.toBeNull()
  })

  it('is hidden from assistive tech — the same outcome is announced instead', () => {
    const { container } = render(<DragGhost frame={frame} size={null} content={content} outcome={accepted} rejecting={false} />)
    expect(container.querySelector('.ghost')).toHaveAttribute('aria-hidden', 'true')
  })
})
