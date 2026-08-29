import { describe, expect, it } from 'vitest'
import { resolveDrop } from './resolveDrop'
import type { DragSubject, DropZones } from './resolveDrop'
import type { Rect } from './geometry'

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom })

/**
 * A layout roughly matching the real one: the rail (library above, trash
 * below) on the left, the table's tray across the top right.
 */
function zones(overrides: Partial<DropZones> = {}): DropZones {
  return {
    tray: rect(300, 0, 900, 100),
    trayItems: [rect(310, 10, 410, 90), rect(420, 10, 520, 90)],
    library: rect(0, 0, 260, 400),
    libraryItems: [rect(10, 10, 250, 60), rect(10, 70, 250, 120)],
    trash: rect(0, 500, 260, 560),
    deckTargets: [
      { id: 'd1', name: 'Food words', rect: rect(10, 10, 250, 60), isVirtual: false, alreadyHas: false },
      { id: 'd2', name: 'Travel', rect: rect(10, 70, 250, 120), isVirtual: false, alreadyHas: true },
      { id: 'dictionary', name: 'Dictionary', rect: rect(10, 130, 250, 180), isVirtual: true, alreadyHas: false },
    ],
    cardList: null,
    ...overrides,
  }
}

const draggedDeck: DragSubject = { kind: 'deck', id: 'd1', deck: { name: 'Food words', isVirtual: false, kept: 18 } }
const draggedChip: DragSubject = { kind: 'chip', id: 'd1', deck: { name: 'Food words', isVirtual: false, kept: 18 } }
const draggedDictionary: DragSubject = {
  kind: 'deck',
  id: 'dictionary',
  deck: { name: 'Dictionary', isVirtual: true, kept: 16244 },
}
const draggedCard: DragSubject = { kind: 'card', id: 'e1' }

describe('resolveDrop — a deck from the rail', () => {
  it('puts the deck in play at the insertion index, promising the filtered count', () => {
    const outcome = resolveDrop(draggedDeck, zones(), 415, 50)
    expect(outcome).toMatchObject({ ok: true, act: 'play', index: 1, highlight: 'tray', label: '+18 cards' })
  })

  it('reorders within the library when dropped back on the rail', () => {
    const outcome = resolveDrop(draggedDeck, zones(), 100, 80)
    expect(outcome).toMatchObject({ ok: true, act: 'reorder-lib', index: 1, highlight: 'library' })
  })

  it('deletes when dropped on the trash', () => {
    expect(resolveDrop(draggedDeck, zones(), 100, 530)).toMatchObject({ ok: true, act: 'delete', highlight: 'trash' })
  })

  it('refuses to delete the read-only dictionary, but still lights the trash', () => {
    const outcome = resolveDrop(draggedDictionary, zones(), 100, 530)
    expect(outcome.ok).toBe(false)
    expect(outcome.act).toBeNull()
    expect(outcome.highlight).toBe('trash')
    expect(outcome.label).toBe("The dictionary can't be deleted")
  })

  it('refuses to reorder the dictionary into the user deck list', () => {
    const outcome = resolveDrop(draggedDictionary, zones(), 100, 100)
    expect(outcome).toMatchObject({ ok: false, act: null, label: 'Reference decks stay put' })
  })

  it('names the expected target when dropped on nothing', () => {
    expect(resolveDrop(draggedDeck, zones(), 1200, 800)).toMatchObject({ ok: false, act: null, label: 'Drop on the table' })
  })

  it('has no trash zone to hit before a drag materialises it', () => {
    expect(resolveDrop(draggedDeck, zones({ trash: null }), 100, 530)).toMatchObject({ ok: false, act: null })
  })
})

describe('resolveDrop — a chip from the table', () => {
  it('reorders within the tray', () => {
    expect(resolveDrop(draggedChip, zones(), 350, 50)).toMatchObject({ ok: true, act: 'reorder-play', index: 0, label: 'Move here' })
  })

  it('takes the deck off the table when dropped anywhere else', () => {
    expect(resolveDrop(draggedChip, zones(), 1200, 800)).toMatchObject({ ok: true, act: 'off', label: 'Take off the table' })
  })

  it('takes it off — not deletes it — when dropped on the trash', () => {
    expect(resolveDrop(draggedChip, zones(), 100, 530)).toMatchObject({ ok: true, act: 'off', highlight: 'trash' })
  })

  it('does not reorder the library, since a chip does not live there', () => {
    expect(resolveDrop(draggedChip, zones(), 100, 100)).toMatchObject({ act: 'off' })
  })
})

describe('resolveDrop — a card being filed', () => {
  it('files into the deck under the pointer', () => {
    expect(resolveDrop(draggedCard, zones(), 100, 30)).toMatchObject({
      ok: true,
      act: 'add',
      deckId: 'd1',
      highlight: 'deck',
      highlightDeckId: 'd1',
      label: '+1 → Food words',
    })
  })

  it('refuses a deck that already holds the card, and says which', () => {
    expect(resolveDrop(draggedCard, zones(), 100, 90)).toMatchObject({ ok: false, act: null, label: 'Already in Travel' })
  })

  it('refuses the read-only dictionary', () => {
    expect(resolveDrop(draggedCard, zones(), 100, 150)).toMatchObject({
      ok: false,
      act: null,
      highlightDeckId: 'dictionary',
      label: 'The dictionary is read-only',
    })
  })

  it('starts a new deck when dropped on the library but not on a deck', () => {
    expect(resolveDrop(draggedCard, zones(), 100, 300)).toMatchObject({ ok: true, act: 'new-deck', highlight: 'library' })
  })

  it('refuses the tray, and says where the card should go instead', () => {
    expect(resolveDrop(draggedCard, zones(), 600, 50)).toMatchObject({
      ok: false,
      act: null,
      highlight: 'tray',
      label: 'Drop on a deck, not the table',
    })
  })

  it('falls back to a generic instruction off every zone', () => {
    expect(resolveDrop(draggedCard, zones(), 1200, 800)).toMatchObject({ ok: false, label: 'Drop on one of your decks' })
  })

  it('treats a dictionary entry from the browse drawer exactly like the showing card', () => {
    expect(resolveDrop({ kind: 'entry', id: 'e1' }, zones(), 100, 30)).toMatchObject({ ok: true, act: 'add', deckId: 'd1' })
  })
})

describe('resolveDrop — a card dragged out of a deck', () => {
  const fromKitchen: DragSubject = { kind: 'entry', id: 'e2', from: { id: 'd2', name: 'Travel' } }

  it('moves rather than copies when it lands on another deck', () => {
    expect(resolveDrop(fromKitchen, zones(), 100, 30)).toMatchObject({
      ok: true,
      act: 'move',
      deckId: 'd1',
      label: 'Move to Food words',
    })
  })

  it('copies instead while the platform copy modifier is held', () => {
    expect(resolveDrop({ ...fromKitchen, copy: true }, zones(), 100, 30)).toMatchObject({
      ok: true,
      act: 'add',
      deckId: 'd1',
      label: '+1 → Food words',
    })
  })

  it('refuses being dropped back where it came from', () => {
    // The source holds the card by definition, so the already-has branch covers it.
    const homeAgain: DragSubject = { kind: 'entry', id: 'e1', from: { id: 'd2', name: 'Travel' } }
    expect(resolveDrop(homeAgain, zones(), 100, 90)).toMatchObject({ ok: false, act: null, label: 'Already in Travel' })
  })

  it('removes from its deck when dropped on the trash', () => {
    expect(resolveDrop(fromKitchen, zones(), 100, 530)).toMatchObject({
      ok: true,
      act: 'remove',
      highlight: 'trash',
      label: 'Remove from Travel',
    })
  })

  it('still removes while the copy modifier is held — there is nothing to copy to', () => {
    expect(resolveDrop({ ...fromKitchen, copy: true }, zones(), 100, 530)).toMatchObject({ ok: true, act: 'remove' })
  })

  it('copies into a new deck rather than emptying the one being viewed', () => {
    expect(resolveDrop(fromKitchen, zones(), 100, 300)).toMatchObject({ ok: true, act: 'new-deck' })
  })

  it('refuses the read-only dictionary like any other card drag', () => {
    expect(resolveDrop(fromKitchen, zones(), 100, 150)).toMatchObject({ ok: false, label: 'The dictionary is read-only' })
  })
})

describe('resolveDrop — a card with nowhere to go back to', () => {
  it('only ever adds, never moves', () => {
    expect(resolveDrop(draggedCard, zones(), 100, 30)).toMatchObject({ act: 'add' })
  })

  it('ignores the trash, even when the zone is supplied', () => {
    // The engine does not arm the trash for these, but the resolver must not
    // depend on that to stay safe.
    expect(resolveDrop(draggedCard, zones(), 100, 530)).toMatchObject({ ok: false, act: null })
  })
})

describe("resolveDrop — the open deck's card list", () => {
  const list = {
    deckId: 'd1',
    deckName: 'Food words',
    rect: rect(300, 600, 900, 800),
    items: [rect(310, 610, 410, 650), rect(420, 610, 520, 650)],
    alreadyHas: false,
  }
  const withList = (overrides = {}) => zones({ cardList: { ...list, ...overrides } })
  const fromThisDeck: DragSubject = { kind: 'entry', id: 'e9', from: { id: 'd1', name: 'Food words' } }
  const fromAnother: DragSubject = { kind: 'entry', id: 'e9', from: { id: 'd2', name: 'Travel' } }

  it('reorders within the deck when the card came from it', () => {
    expect(resolveDrop(fromThisDeck, withList({ alreadyHas: true }), 415, 630)).toMatchObject({
      ok: true,
      act: 'reorder-cards',
      deckId: 'd1',
      index: 1,
      highlight: 'cards',
      label: 'Move here',
    })
  })

  it('places the card at the end when dropped past every row', () => {
    expect(resolveDrop(fromThisDeck, withList({ alreadyHas: true }), 880, 630)).toMatchObject({ act: 'reorder-cards', index: 2 })
  })

  it('adds a card from elsewhere at the position it was dropped', () => {
    expect(resolveDrop(draggedCard, withList(), 415, 630)).toMatchObject({
      ok: true,
      act: 'add',
      deckId: 'd1',
      index: 1,
      label: '+1 → Food words',
    })
  })

  it('moves a card in from another deck, rather than copying it', () => {
    expect(resolveDrop(fromAnother, withList(), 415, 630)).toMatchObject({ ok: true, act: 'move', deckId: 'd1', index: 1 })
  })

  it('copies in from another deck while the modifier is held', () => {
    expect(resolveDrop({ ...fromAnother, copy: true }, withList(), 415, 630)).toMatchObject({ act: 'add', deckId: 'd1' })
  })

  it('refuses a card the deck already holds and did not come from', () => {
    expect(resolveDrop(fromAnother, withList({ alreadyHas: true }), 415, 630)).toMatchObject({
      ok: false,
      act: null,
      label: 'Already in Food words',
    })
  })

  it('takes precedence over the deck rows behind it', () => {
    // The list is the more specific target, and unlike a rail row it can say where.
    const overlapping = zones({ cardList: { ...list, rect: rect(0, 0, 900, 800) } })
    expect(resolveDrop(draggedCard, overlapping, 100, 30)).toMatchObject({ act: 'add', index: expect.any(Number) })
  })

  it('is not consulted for a deck drag', () => {
    expect(resolveDrop(draggedDeck, withList(), 415, 630)).toMatchObject({ act: null })
  })
})
