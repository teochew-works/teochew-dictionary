import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBackup, restoreBackup } from './backup'
import { readDecksState, writeDecksState } from '../decks/storage'
import type { DecksState } from '../decks/storage'
import { DICTIONARY_DECK_ID } from '../decks/virtualDeck'
import type { CardState } from '../srs/types'

const stored = new Map<string, CardState>()
const cleared: boolean[] = []
const putAll = vi.fn()

vi.mock('../srs/db', () => ({
  getAllCards: () => Promise.resolve(new Map(stored)),
  clearAllCards: () => {
    cleared.push(true)
    stored.clear()
    return Promise.resolve()
  },
  putAllCards: (cards: CardState[]) => {
    putAll(cards)
    for (const c of cards) stored.set(c.entryId, c)
    return Promise.resolve()
  },
}))

const CARD: CardState = {
  entryId: 'e1',
  efactor: 2.5,
  interval: 3,
  repetitions: 2,
  dueAt: '2026-09-01T00:00:00.000Z',
  lastReviewedAt: '2026-08-25T00:00:00.000Z',
}

const DECK_STATE: DecksState = {
  decks: [{ id: 'deck-1', name: 'Kitchen', hue: 'green', cards: ['e1'], kind: 'user' }],
  inPlay: [DICTIONARY_DECK_ID, 'deck-1'],
  groups: [],
}

describe('buildBackup / restoreBackup', () => {
  beforeEach(() => {
    localStorage.clear()
    stored.clear()
    cleared.length = 0
    putAll.mockClear()
  })

  it('bundles the current decks and every reviewed card', async () => {
    writeDecksState(DECK_STATE)
    stored.set('e1', CARD)

    const backup = await buildBackup()
    expect(backup.app).toBe('teochew-dictionary')
    expect(backup.decks).toEqual(DECK_STATE)
    expect(backup.cards).toEqual([CARD])
    expect(new Date(backup.exportedAt).toString()).not.toBe('Invalid Date')
  })

  it('round-trips through restore', async () => {
    writeDecksState(DECK_STATE)
    stored.set('e1', CARD)
    const backup = await buildBackup()

    // Simulate a different browser: clear everything, then restore the file.
    writeDecksState({ decks: [], inPlay: [DICTIONARY_DECK_ID], groups: [] })
    stored.clear()

    const result = await restoreBackup(backup)
    expect(result).toEqual({ ok: true, deckCount: 1, cardCount: 1 })
    expect(readDecksState()).toEqual(DECK_STATE)
    expect(stored.get('e1')).toEqual(CARD)
  })

  it('replaces rather than merges — a card missing from the file is gone after restore', async () => {
    stored.set('stale', { ...CARD, entryId: 'stale' })
    const incoming = { ...(await buildBackup()), decks: DECK_STATE, cards: [CARD] }

    await restoreBackup(incoming)

    expect(cleared).toEqual([true])
    expect([...stored.keys()]).toEqual(['e1'])
  })

  it('rejects a file that is not a backup at all, and touches nothing', async () => {
    writeDecksState(DECK_STATE)
    stored.set('e1', CARD)

    const result = await restoreBackup({ hello: 'world' })

    expect(result.ok).toBe(false)
    expect(readDecksState()).toEqual(DECK_STATE)
    expect(stored.get('e1')).toEqual(CARD)
    expect(putAll).not.toHaveBeenCalled()
  })

  it('rejects a card carrying fields this version does not recognise', async () => {
    const backup = await buildBackup()
    const tampered = { ...backup, decks: DECK_STATE, cards: [{ ...CARD, futureField: 'x' }] }

    const result = await restoreBackup(tampered)

    expect(result.ok).toBe(false)
  })

  it('rejects a wrong version number rather than guessing at its shape', async () => {
    const backup = await buildBackup()
    const result = await restoreBackup({ ...backup, decks: DECK_STATE, version: 2 })
    expect(result.ok).toBe(false)
  })
})
