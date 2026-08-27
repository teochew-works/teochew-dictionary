import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SettingsView } from './SettingsView'
import { DictionaryView } from './DictionaryView'
import { makeEntry } from '../test/entryFixtures'

describe('SettingsView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('leaves every toggle unchecked by default, except sandhi pronunciation', () => {
    render(<SettingsView />)
    expect(screen.getByLabelText('Show licensing info')).not.toBeChecked()
    expect(screen.getByLabelText('Only entries with audio')).not.toBeChecked()
    expect(screen.getByLabelText('Only fully recorded audio')).not.toBeChecked()
    expect(screen.getByLabelText('Use sandhi pronunciation')).toBeChecked()
    expect(screen.getByLabelText('Link to mogher.com')).not.toBeChecked()
  })

  it('persists each toggle to its own localStorage key', () => {
    render(<SettingsView />)

    fireEvent.click(screen.getByLabelText('Show licensing info'))
    fireEvent.click(screen.getByLabelText('Only entries with audio'))
    fireEvent.click(screen.getByLabelText('Only fully recorded audio'))
    fireEvent.click(screen.getByLabelText('Use sandhi pronunciation'))
    fireEvent.click(screen.getByLabelText('Link to mogher.com'))

    expect(localStorage.getItem('teochew-dictionary:show-licence')).toBe('true')
    expect(localStorage.getItem('teochew-dictionary:audio-only')).toBe('true')
    expect(localStorage.getItem('teochew-dictionary:flashcard-full-audio-only')).toBe('true')
    expect(localStorage.getItem('teochew-dictionary:pronunciation-mode')).toBe('citation')
    expect(localStorage.getItem('teochew-dictionary:mogher-links')).toBe('true')
  })

  it('restores a previously persisted value on mount', () => {
    localStorage.setItem('teochew-dictionary:show-licence', 'true')
    localStorage.setItem('teochew-dictionary:mogher-links', 'true')
    render(<SettingsView />)
    expect(screen.getByLabelText('Show licensing info')).toBeChecked()
    expect(screen.getByLabelText('Link to mogher.com')).toBeChecked()
  })

  it('a value set here is reflected by DictionaryView\'s own convenience checkbox on remount', () => {
    const { unmount } = render(<SettingsView />)
    fireEvent.click(screen.getByLabelText('Show licensing info'))
    unmount()

    render(<DictionaryView entries={[makeEntry()]} />)
    expect(screen.getByLabelText('Show licensing info')).toBeChecked()
  })
})
