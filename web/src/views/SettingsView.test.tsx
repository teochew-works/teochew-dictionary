import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsView } from './SettingsView'
import { DictionaryView } from './DictionaryView'
import { makeEntry, makeReading, toRawEntry } from '../test/entryFixtures'
import type { AudioReference, CardState } from '@teochew/core'

const storedCards = new Map<string, CardState>()

vi.mock('../srs/db', () => ({
  getAllCards: () => Promise.resolve(new Map(storedCards)),
  clearAllCards: () => {
    storedCards.clear()
    return Promise.resolve()
  },
  putAllCards: (cards: CardState[]) => {
    for (const c of cards) storedCards.set(c.entryId, c)
    return Promise.resolve()
  },
}))

describe('SettingsView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('leaves every toggle unchecked by default, except sandhi pronunciation and show licensing info', () => {
    render(<SettingsView />)
    expect(screen.getByLabelText('Show licensing info')).toBeChecked()
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

    expect(localStorage.getItem('teochew-dictionary:show-licence')).toBe('false')
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

    render(<DictionaryView entries={[toRawEntry(makeEntry())]} />)
    expect(screen.getByLabelText('Show licensing info')).not.toBeChecked()
  })
})

describe('SettingsView speaker preference', () => {
  const clip = (speaker: string): AudioReference => ({
    key: 'dio5',
    url: `https://example.test/${speaker}.opus`,
    confidence: 'high',
    speaker,
    licence: 'CC-BY-4.0',
    attributions: [],
  })

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('is absent when the dictionary has no recordings at all', () => {
    render(<SettingsView entries={[]} />)
    expect(screen.queryByText('Speaker preference')).not.toBeInTheDocument()
  })

  it('is absent when only one speaker is recorded anywhere', () => {
    const entry = toRawEntry(makeEntry({ readings: [makeReading({ audio: [clip('jky'), null] })] }))
    render(<SettingsView entries={[entry]} />)
    expect(screen.queryByText('Speaker preference')).not.toBeInTheDocument()
  })

  it('offers every speaker recorded anywhere once two or more exist', () => {
    const entry = toRawEntry(makeEntry({ readings: [makeReading({ audio: [clip('jky'), clip('jky-n')] })] }))
    render(<SettingsView entries={[entry]} />)
    expect(screen.getByText('Speaker preference')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ jky' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ jky-n' })).toBeInTheDocument()
  })

  it('persists a chosen ranking across remounts', () => {
    const entry = toRawEntry(makeEntry({ readings: [makeReading({ audio: [clip('jky'), clip('jky-n')] })] }))
    const { unmount } = render(<SettingsView entries={[entry]} />)

    fireEvent.click(screen.getByRole('button', { name: '+ jky-n' }))
    expect(localStorage.getItem('teochew-dictionary:speaker-preference')).toBe(JSON.stringify(['jky-n']))
    unmount()

    render(<SettingsView entries={[entry]} />)
    expect(document.querySelector('.speaker-preference__list')).toHaveTextContent('jky-n')
  })
})

describe('SettingsView backup', () => {
  beforeEach(() => {
    localStorage.clear()
    storedCards.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('exports a JSON file named for the day, without touching stored state', async () => {
    localStorage.setItem('teochew-dictionary:show-licence', 'true')
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(localStorage.getItem('teochew-dictionary:show-licence')).toBe('true')
    vi.unstubAllGlobals()
  })

  it('asks for confirmation before importing, and does nothing if declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SettingsView />)
    const file = new File(
      ['{"app":"teochew-dictionary","kind":"backup","version":1,"exportedAt":"2026-01-01T00:00:00.000Z","decks":{"decks":[],"inPlay":[],"groups":[]},"cards":[]}'],
      'backup.json',
      { type: 'application/json' },
    )

    fireEvent.change(screen.getByLabelText('Import backup file'), { target: { files: [file] } })

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('restores decks and cards on a confirmed import, and reports what it restored', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SettingsView />)
    const backup = {
      app: 'teochew-dictionary',
      kind: 'backup',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      decks: { decks: [{ id: 'd1', name: 'Kitchen', hue: 'green', cards: ['e1'], kind: 'user' }], inPlay: [], groups: [] },
      cards: [{ entryId: 'e1', efactor: 2.5, interval: 1, repetitions: 1, dueAt: '2026-01-02T00:00:00.000Z', lastReviewedAt: null }],
    }
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })

    fireEvent.change(screen.getByLabelText('Import backup file'), { target: { files: [file] } })

    expect(await screen.findByRole('status')).toHaveTextContent('Restored 1 deck and 1 reviewed card')
    expect(localStorage.getItem('teochew-dictionary:decks/v1')).toContain('Kitchen')
    expect(storedCards.get('e1')).toBeDefined()
  })

  it('reports an error for a file that is not a backup, and leaves existing state alone', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    localStorage.setItem('teochew-dictionary:decks/v1', JSON.stringify({ decks: [], inPlay: [], groups: [] }))
    render(<SettingsView />)
    const file = new File(['{"not":"a backup"}'], 'backup.json', { type: 'application/json' })

    fireEvent.change(screen.getByLabelText('Import backup file'), { target: { files: [file] } })

    expect(await screen.findByRole('status')).toHaveTextContent("doesn't look like a Teochew Dictionary backup")
  })
})
