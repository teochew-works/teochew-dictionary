import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useDeckDrag } from './useDeckDrag'
import type { DeckDragActions, DeckDragContext } from './useDeckDrag'

/**
 * jsdom runs no layout, so every getBoundingClientRect is all-zero — the
 * only way to exercise real drop resolution here is to hand each registered
 * element the rect it would have had.
 */
function box(left: number, top: number, right: number, bottom: number): HTMLElement {
  const node = document.createElement('div')
  node.getBoundingClientRect = () =>
    ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect
  document.body.append(node)
  return node
}

function press(node: HTMLElement, x: number, y: number): ReactPointerEvent {
  return { button: 0, clientX: x, clientY: y, currentTarget: node } as unknown as ReactPointerEvent
}

function move(x: number, y: number) {
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
}

function release(x: number, y: number) {
  document.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true }))
}

const DECKS: Record<string, { name: string; isVirtual: boolean; kept: number; cards: string[] }> = {
  dictionary: { name: 'Dictionary', isVirtual: true, kept: 16244, cards: ['e1'] },
  d1: { name: 'Food words', isVirtual: false, kept: 18, cards: [] },
  d2: { name: 'Travel', isVirtual: false, kept: 4, cards: ['e1'] },
}

function context(): DeckDragContext {
  return {
    inPlayIds: ['dictionary'],
    libraryIds: ['d1', 'd2'],
    deckInfo: (id) => {
      const deck = DECKS[id]
      if (!deck) return null
      return { name: deck.name, isVirtual: deck.isVirtual, kept: deck.kept, hasCard: (e) => deck.cards.includes(e) }
    },
  }
}

function actions(): DeckDragActions & Record<keyof DeckDragActions, ReturnType<typeof vi.fn>> {
  const a: DeckDragActions = {
    onPlay: vi.fn(),
    onReorderPlay: vi.fn(),
    onReorderLibrary: vi.fn(),
    onTakeOff: vi.fn(),
    onDelete: vi.fn(),
    onAddCard: vi.fn(),
    onNewDeckFromCard: vi.fn(),
  }
  return a as DeckDragActions & Record<keyof DeckDragActions, ReturnType<typeof vi.fn>>
}

/** The same layout every case below drags across: rail on the left, tray across the top right. */
function setup() {
  const a = actions()
  const announce = vi.fn()
  const view = renderHook(() => useDeckDrag(context(), a, announce))
  const drag = () => view.result.current

  const railD1 = box(0, 0, 260, 50)
  const railD2 = box(0, 60, 260, 110)
  const railDict = box(0, 120, 260, 170)

  act(() => {
    drag().trayRef(box(300, 0, 900, 100))
    drag().libraryRef(box(0, 0, 260, 400))
    drag().trashRef(box(0, 500, 260, 560))
    drag().trayItemRef('dictionary')(box(310, 10, 410, 90))
    drag().deckTargetRef('dictionary', 'tray')(box(310, 10, 410, 90))
    drag().libraryItemRef('d1')(railD1)
    drag().libraryItemRef('d2')(railD2)
    drag().deckTargetRef('d1', 'rail')(railD1)
    drag().deckTargetRef('d2', 'rail')(railD2)
    drag().deckTargetRef('dictionary', 'rail')(railDict)
  })

  return { ...view, drag, a, announce, railD1, railDict }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useDeckDrag', () => {
  it('does not start a drag before the pointer has travelled', () => {
    const { drag, railD1 } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(22, 21))
    expect(drag().subject).toBeNull()
  })

  it('starts once the pointer passes the threshold', () => {
    const { drag, railD1 } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(60, 20))
    expect(drag().subject).toMatchObject({ kind: 'deck', id: 'd1' })
  })

  it('a press with no movement leaves no drag behind', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => release(20, 20))
    expect(drag().subject).toBeNull()
    expect(a.onPlay).not.toHaveBeenCalled()
  })

  it('fills in the dragged deck from live state, so the badge promises a real count', () => {
    const { drag, railD1 } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(600, 50))
    expect(drag().outcome).toMatchObject({ ok: true, act: 'play', label: '+18 cards' })
  })

  it('puts a deck in play at the index it was dropped', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(320, 50))
    act(() => release(320, 50))
    expect(a.onPlay).toHaveBeenCalledWith('d1', 0)
  })

  it('reorders within the library', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(100, 200))
    act(() => release(100, 200))
    expect(a.onReorderLibrary).toHaveBeenCalledWith('d1', 1)
  })

  it('deletes a deck dropped on the trash', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(100, 530))
    act(() => release(100, 530))
    expect(a.onDelete).toHaveBeenCalledWith('d1')
  })

  it('takes a chip off the table when dropped away from the tray', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'chip', id: 'dictionary' })(press(railD1, 350, 50)))
    act(() => move(700, 700))
    act(() => release(700, 700))
    expect(a.onTakeOff).toHaveBeenCalledWith('dictionary')
  })

  it('files a card onto a deck row', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'card', id: 'e1' })(press(railD1, 700, 700)))
    act(() => move(100, 20))
    expect(drag().outcome).toMatchObject({ ok: true, act: 'add', label: '+1 → Food words' })
    act(() => release(100, 20))
    expect(a.onAddCard).toHaveBeenCalledWith('d1', 'e1')
  })

  it('refuses a deck that already holds the card, and does nothing on release', () => {
    const { drag, railD1, a, announce } = setup()
    act(() => drag().onPointerDown({ kind: 'card', id: 'e1' })(press(railD1, 700, 700)))
    act(() => move(100, 80))
    expect(drag().outcome).toMatchObject({ ok: false, label: 'Already in Travel' })

    act(() => release(100, 80))
    expect(a.onAddCard).not.toHaveBeenCalled()
    expect(announce).toHaveBeenCalledWith('Already in Travel')
    expect(drag().rejecting).toBe(true)
  })

  it('refuses the dictionary wherever it appears — the rail row and the tray chip alike', () => {
    const { drag, railD1 } = setup()
    act(() => drag().onPointerDown({ kind: 'card', id: 'e2' })(press(railD1, 700, 700)))
    act(() => move(100, 140))
    expect(drag().outcome).toMatchObject({ ok: false, label: 'The dictionary is read-only' })
    act(() => move(350, 50))
    expect(drag().outcome).toMatchObject({ ok: false, label: 'The dictionary is read-only' })
  })

  it('starts a new deck from a card dropped on the library but not on a deck', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'card', id: 'e2' })(press(railD1, 700, 700)))
    act(() => move(100, 300))
    act(() => release(100, 300))
    expect(a.onNewDeckFromCard).toHaveBeenCalledWith('e2')
  })

  it('never offers the trash to a card drag', () => {
    const { drag, railD1, a } = setup()
    act(() => drag().onPointerDown({ kind: 'card', id: 'e2' })(press(railD1, 700, 700)))
    act(() => move(100, 530))
    act(() => release(100, 530))
    expect(a.onDelete).not.toHaveBeenCalled()
  })

  it('sizes the drag image to the element it came from', () => {
    const { drag, railD1 } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    expect(drag().ghostSize).toEqual({ width: 260, height: 50 })
  })

  it('reports which item is in the air, by kind as well as id', () => {
    const { drag, railD1 } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(60, 20))
    expect(drag().isDragging('deck', 'd1')).toBe(true)
    expect(drag().isDragging('chip', 'd1')).toBe(false)
  })

  it('still shows a drag image under reduced motion — the badge is an affordance, not decoration', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    )
    const { drag, railD1 } = setup()

    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(600, 50))

    expect(drag().ghost).not.toBeNull()
    expect(drag().ghost?.angle).toBe(0)
    expect(drag().outcome?.label).toBe('+18 cards')
    vi.restoreAllMocks()
  })

  it('clears the drag on release', () => {
    const { drag, railD1 } = setup()
    act(() => drag().onPointerDown({ kind: 'deck', id: 'd1' })(press(railD1, 20, 20)))
    act(() => move(320, 50))
    act(() => release(320, 50))
    expect(drag().subject).toBeNull()
    expect(drag().outcome).toBeNull()
  })
})
