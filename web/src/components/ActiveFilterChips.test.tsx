import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ActiveFilterChips } from './ActiveFilterChips'

describe('ActiveFilterChips', () => {
  it('renders nothing when there are no chips', () => {
    const { container } = render(<ActiveFilterChips chips={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a chip per entry', () => {
    render(
      <ActiveFilterChips
        chips={[
          { key: 'level', label: 'Levels: A1', onRemove: vi.fn() },
          { key: 'audio', label: 'Full audio only', onRemove: vi.fn() },
        ]}
      />,
    )
    expect(screen.getByText('Levels: A1')).toBeInTheDocument()
    expect(screen.getByText('Full audio only')).toBeInTheDocument()
  })

  it('calls the chip-specific onRemove when its button is clicked', () => {
    const onRemoveLevel = vi.fn()
    const onRemoveAudio = vi.fn()
    render(
      <ActiveFilterChips
        chips={[
          { key: 'level', label: 'Levels: A1', onRemove: onRemoveLevel },
          { key: 'audio', label: 'Full audio only', onRemove: onRemoveAudio },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Full audio only' }))

    expect(onRemoveAudio).toHaveBeenCalledOnce()
    expect(onRemoveLevel).not.toHaveBeenCalled()
  })
})
