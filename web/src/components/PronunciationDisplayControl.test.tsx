import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PronunciationDisplayControl } from './PronunciationDisplayControl'
import { DEFAULT_PRONUNCIATION_DISPLAY } from '@teochew/core'

describe('PronunciationDisplayControl', () => {
  afterEach(cleanup)

  it('lists the selected fields in order, with an add button per excluded field', () => {
    render(<PronunciationDisplayControl fields={['ipa', 'pengim']} onChange={vi.fn()} />)
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toContain('IPA')
    expect(items[1]).toContain("Peng'im")
    expect(screen.getByRole('button', { name: '+ POJ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Sandhi' })).toBeInTheDocument()
  })

  it('moves a field up', () => {
    const onChange = vi.fn()
    render(<PronunciationDisplayControl fields={['ipa', 'pengim', 'poj']} onChange={onChange} />)
    screen.getByLabelText("Move Peng'im up").click()
    expect(onChange).toHaveBeenCalledWith(['pengim', 'ipa', 'poj'])
  })

  it('moves a field down', () => {
    const onChange = vi.fn()
    render(<PronunciationDisplayControl fields={['ipa', 'pengim', 'poj']} onChange={onChange} />)
    screen.getByLabelText('Move IPA down').click()
    expect(onChange).toHaveBeenCalledWith(['pengim', 'ipa', 'poj'])
  })

  it('disables moving the first field up and the last field down', () => {
    render(<PronunciationDisplayControl fields={DEFAULT_PRONUNCIATION_DISPLAY} onChange={vi.fn()} />)
    expect(screen.getByLabelText("Move Peng'im up")).toBeDisabled()
    expect(screen.getByLabelText('Move Sandhi down')).toBeDisabled()
  })

  it('removes a field', () => {
    const onChange = vi.fn()
    render(<PronunciationDisplayControl fields={['ipa', 'pengim']} onChange={onChange} />)
    screen.getByLabelText('Remove IPA').click()
    expect(onChange).toHaveBeenCalledWith(['pengim'])
  })

  it('disallows removing the last remaining field', () => {
    render(<PronunciationDisplayControl fields={['ipa']} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Remove IPA')).toBeDisabled()
  })

  it('re-adds an excluded field to the end', () => {
    const onChange = vi.fn()
    render(<PronunciationDisplayControl fields={['ipa', 'pengim']} onChange={onChange} />)
    screen.getByRole('button', { name: '+ Sandhi' }).click()
    expect(onChange).toHaveBeenCalledWith(['ipa', 'pengim', 'sandhi'])
  })
})
