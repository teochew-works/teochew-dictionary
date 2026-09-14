import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SpeakerPreferenceControl } from './SpeakerPreferenceControl'

describe('SpeakerPreferenceControl', () => {
  afterEach(cleanup)

  it('lists the ranked speakers in order, with an add button per excluded speaker', () => {
    render(<SpeakerPreferenceControl speakers={['jky-n', 'jky']} availableSpeakers={['jky', 'jky-n', 'zed']} onChange={vi.fn()} />)
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toContain('jky-n')
    expect(items[1]).toContain('jky')
    expect(screen.getByRole('button', { name: '+ zed' })).toBeInTheDocument()
  })

  it('renders no list when the ranking is empty — the default, no-preference state', () => {
    render(<SpeakerPreferenceControl speakers={[]} availableSpeakers={['jky', 'jky-n']} onChange={vi.fn()} />)
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ jky' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ jky-n' })).toBeInTheDocument()
  })

  it('moves a speaker up', () => {
    const onChange = vi.fn()
    render(<SpeakerPreferenceControl speakers={['jky', 'jky-n', 'zed']} availableSpeakers={['jky', 'jky-n', 'zed']} onChange={onChange} />)
    screen.getByLabelText('Move jky-n up').click()
    expect(onChange).toHaveBeenCalledWith(['jky-n', 'jky', 'zed'])
  })

  it('moves a speaker down', () => {
    const onChange = vi.fn()
    render(<SpeakerPreferenceControl speakers={['jky', 'jky-n', 'zed']} availableSpeakers={['jky', 'jky-n', 'zed']} onChange={onChange} />)
    screen.getByLabelText('Move jky down').click()
    expect(onChange).toHaveBeenCalledWith(['jky-n', 'jky', 'zed'])
  })

  it('disables moving the first speaker up and the last speaker down', () => {
    render(<SpeakerPreferenceControl speakers={['jky', 'jky-n']} availableSpeakers={['jky', 'jky-n']} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Move jky up')).toBeDisabled()
    expect(screen.getByLabelText('Move jky-n down')).toBeDisabled()
  })

  it('removes a speaker, allowing the ranking to become empty', () => {
    const onChange = vi.fn()
    render(<SpeakerPreferenceControl speakers={['jky']} availableSpeakers={['jky', 'jky-n']} onChange={onChange} />)
    screen.getByLabelText('Remove jky').click()
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('re-adds an excluded speaker to the end', () => {
    const onChange = vi.fn()
    render(<SpeakerPreferenceControl speakers={['jky']} availableSpeakers={['jky', 'jky-n']} onChange={onChange} />)
    screen.getByRole('button', { name: '+ jky-n' }).click()
    expect(onChange).toHaveBeenCalledWith(['jky', 'jky-n'])
  })
})
