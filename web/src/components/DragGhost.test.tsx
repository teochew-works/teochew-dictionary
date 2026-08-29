import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DragGhost } from './DragGhost'
import type { DropOutcome } from '../decks/dnd/resolveDrop'

const content = { title: 'Food words', subtitle: '18 cards', hue: 'rebeccapurple' }
const accepted: DropOutcome = { ok: true, act: 'play', index: 0, highlight: 'tray', label: '+18 cards' }
const refused: DropOutcome = { ok: false, act: null, highlight: 'deck', label: 'The dictionary is read-only' }
const deleting: DropOutcome = { ok: true, act: 'delete', highlight: 'trash', label: 'Delete deck' }

function ghost(overrides: Partial<Parameters<typeof DragGhost>[0]> = {}) {
  return render(
    <DragGhost visible elementRef={vi.fn()} size={null} content={content} outcome={accepted} rejecting={false} {...overrides} />,
  )
}

describe('DragGhost', () => {
  it('renders nothing when no drag is in flight', () => {
    const { container } = ghost({ visible: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows what is being dragged', () => {
    ghost()
    expect(screen.getByText('Food words')).toBeInTheDocument()
    expect(screen.getByText('18 cards')).toBeInTheDocument()
  })

  it('names the outcome on the badge', () => {
    ghost()
    expect(screen.getByText('+18 cards')).toBeInTheDocument()
  })

  it('matches the size of the element the drag came from', () => {
    const { container } = ghost({ size: { width: 200, height: 60 } })
    const el = container.querySelector('.ghost') as HTMLElement
    expect(el.style.width).toBe('200px')
    expect(el.style.minHeight).toBe('60px')
  })

  it('hands the node to the engine, which writes its transform directly', () => {
    const elementRef = vi.fn()
    ghost({ elementRef })
    expect(elementRef).toHaveBeenCalledWith(expect.any(HTMLElement))
  })

  it('sets no transform of its own — position never round-trips through React', () => {
    const { container } = ghost()
    expect((container.querySelector('.ghost') as HTMLElement).style.transform).toBe('')
  })

  it('flips the badge to a refusal when the target says no', () => {
    const { container } = ghost({ outcome: refused })
    expect(container.querySelector('.ghost__badge--no')).not.toBeNull()
    expect(screen.getByText('The dictionary is read-only')).toBeInTheDocument()
  })

  it('marks a delete distinctly from an ordinary accept', () => {
    const { container } = ghost({ outcome: deleting })
    expect(container.querySelector('.ghost__badge--del')).not.toBeNull()
  })

  it('bounces rather than vanishing when a drag ends on a refusal', () => {
    const { container } = ghost({ outcome: refused, rejecting: true })
    expect(container.querySelector('.ghost--reject')).not.toBeNull()
  })

  it('is hidden from assistive tech — the same outcome is announced instead', () => {
    const { container } = ghost()
    expect(container.querySelector('.ghost')).toHaveAttribute('aria-hidden', 'true')
  })
})
