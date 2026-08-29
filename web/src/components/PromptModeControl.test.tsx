import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PromptModeControl } from './PromptModeControl'

describe('PromptModeControl', () => {
  it('checks the radio matching the current mode', () => {
    render(<PromptModeControl mode="english" onChange={vi.fn()} />)
    expect(screen.getByLabelText('English')).toBeChecked()
    expect(screen.getByLabelText('Chinese')).not.toBeChecked()
  })

  it('calls onChange with the selected mode', () => {
    const onChange = vi.fn()
    render(<PromptModeControl mode="chinese" onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Pronunciation'))

    expect(onChange).toHaveBeenCalledWith('pronunciation')
  })

  it('groups every option under one accessible fieldset name', () => {
    render(<PromptModeControl mode="chinese" onChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Flashcard prompt' })).toBeInTheDocument()
  })
})
