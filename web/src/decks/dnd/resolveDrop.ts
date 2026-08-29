import { insertionIndex, pointInRect } from './geometry'
import type { Rect } from './geometry'

/**
 * What is being dragged. The library rail and the table hold the same
 * decks, so the *kind* — not the id — is what decides whether a drop means
 * "put in play", "reorder", or "take off the table".
 */
export type DragKind = 'deck' | 'chip' | 'card' | 'entry'

export type DropAct =
  | 'play'
  | 'reorder-play'
  | 'reorder-lib'
  | 'reorder-cards'
  | 'off'
  | 'delete'
  | 'add'
  | 'move'
  | 'remove'
  | 'new-deck'

/** Which drop zone should light up under the pointer. */
export type DropHighlight = 'tray' | 'library' | 'trash' | 'deck' | 'cards'

export interface DropOutcome {
  /** Whether letting go here would do anything. Drives the badge colour and the reject bounce. */
  ok: boolean
  act: DropAct | null
  /** Insertion index, for the acts that place something in a list. */
  index?: number
  /** Target deck, for 'add'. */
  deckId?: string
  highlight: DropHighlight | null
  /** The deck row to mark accepted/refused, when `highlight` is 'deck'. */
  highlightDeckId?: string
  /** Names the outcome in the drag badge and the aria-live announcement — always set, including for refusals. */
  label: string
}

/** A deck row (rail) or chip (table) that a dragged card or entry could be filed into. */
export interface DeckDropTarget {
  id: string
  name: string
  rect: Rect
  /** The dictionary: it plays like a deck but refuses membership edits. */
  isVirtual: boolean
  /** Whether this deck already holds the card being dragged. */
  alreadyHas: boolean
}

/**
 * The open deck's own card list, when a deck's contents are showing. Unlike a
 * `DeckDropTarget` it can say *where* in the deck a card would land, which is
 * what makes it both a place to reorder within and a place to drop into.
 */
export interface CardListZone {
  deckId: string
  deckName: string
  rect: Rect
  /** The listed cards in display order, excluding the one being dragged. */
  items: Rect[]
  /** Whether this deck already holds the card being dragged. */
  alreadyHas: boolean
}

export interface DropZones {
  /** The table's drop area, or null when it isn't mounted. */
  tray: Rect | null
  /** In-play chips, in display order, excluding the one being dragged. */
  trayItems: Rect[]
  /** The "My decks" list's drop area. */
  library: Rect | null
  /** User deck rows, in display order, excluding the one being dragged. */
  libraryItems: Rect[]
  /** Only materialises while a deck or chip is in the air — null otherwise. */
  trash: Rect | null
  /** Every deck a card can be filed into, rail rows and table chips alike. */
  deckTargets: DeckDropTarget[]
  /** The open deck's card list, or null when the dock isn't showing one. */
  cardList: CardListZone | null
}

export interface DragSubject {
  kind: DragKind
  id: string
  /** Set for 'deck' and 'chip' drags. */
  deck?: {
    name: string
    isVirtual: boolean
    /** Cards that survive the session's filters — what "+N cards" actually promises. */
    kept: number
  }
  /**
   * For a card dragged out of a deck's contents: the deck it is leaving. This
   * is what makes a drop a *move* rather than a copy, and what gives the trash
   * something to remove the card from. A card dragged from the study surface or
   * the dictionary has no source, so it can only ever be added.
   */
  from?: { id: string; name: string }
  /** The platform's copy modifier is held, so a sourced drag copies instead of moving. */
  copy?: boolean
}

const NOTHING: DropOutcome = { ok: false, act: null, highlight: null, label: '' }

function deckTargetAt(targets: DeckDropTarget[], x: number, y: number): DeckDropTarget | null {
  for (const target of targets) {
    if (pointInRect(x, y, target.rect)) return target
  }
  return null
}

/**
 * What would happen if the pointer let go right now — the single place that
 * decides it, so the badge on the drag image, the zone highlight, the
 * announcement, and the mutation that finally runs can never disagree.
 *
 * Pure and DOM-free (mirroring geometry.ts's split): the caller reads live
 * rects at the DOM boundary and hands them in, which is also the only way
 * to test this under jsdom, where getBoundingClientRect reports all zeroes.
 *
 * Zones are tested innermost-first: a deck row sits inside the library, so
 * a card dropped on a row files into that deck rather than starting a new
 * one.
 */
export function resolveDrop(subject: DragSubject, zones: DropZones, x: number, y: number): DropOutcome {
  if (subject.kind === 'deck' || subject.kind === 'chip') {
    return resolveDeckDrop(subject, zones, x, y)
  }
  return resolveCardDrop(subject, zones, x, y)
}

function resolveDeckDrop(subject: DragSubject, zones: DropZones, x: number, y: number): DropOutcome {
  const isChip = subject.kind === 'chip'
  const deck = subject.deck

  if (zones.trash && pointInRect(x, y, zones.trash)) {
    if (isChip) return { ok: true, act: 'off', highlight: 'trash', label: 'Take off the table' }
    if (!deck || deck.isVirtual) return { ok: false, act: null, highlight: 'trash', label: "The dictionary can't be deleted" }
    return { ok: true, act: 'delete', highlight: 'trash', label: 'Delete deck' }
  }

  if (zones.tray && pointInRect(x, y, zones.tray)) {
    const index = insertionIndex(zones.trayItems, { x, y }, 'horizontal')
    return isChip
      ? { ok: true, act: 'reorder-play', index, highlight: 'tray', label: 'Move here' }
      : { ok: true, act: 'play', index, highlight: 'tray', label: `+${(deck?.kept ?? 0).toLocaleString()} cards` }
  }

  if (!isChip && zones.library && pointInRect(x, y, zones.library)) {
    if (!deck || deck.isVirtual) {
      return { ok: false, act: null, highlight: 'library', label: 'Reference decks stay put' }
    }
    const index = insertionIndex(zones.libraryItems, { x, y }, 'vertical')
    return { ok: true, act: 'reorder-lib', index, highlight: 'library', label: 'Reorder' }
  }

  // Dragging a chip clean off the table is how you take a deck out of play —
  // anywhere outside the tray counts, so it doesn't need aiming.
  if (isChip) return { ok: true, act: 'off', highlight: null, label: 'Take off the table' }
  return { ...NOTHING, label: 'Drop on the table' }
}

function resolveCardDrop(subject: DragSubject, zones: DropZones, x: number, y: number): DropOutcome {
  const from = subject.from

  // Only a card that came out of a deck has anything to be removed from, which
  // is also the only case where the caller arms the trash at all.
  if (from && zones.trash && pointInRect(x, y, zones.trash)) {
    return { ok: true, act: 'remove', highlight: 'trash', label: `Remove from ${from.name}` }
  }

  /*
   * The open deck's own list, checked before the rail and the table because it
   * is the more specific target and can place the card at a position rather
   * than only in a deck. Reordering within it and dropping into it are the same
   * gesture; which one it is depends only on where the card came from.
   */
  const list = zones.cardList
  if (list && pointInRect(x, y, list.rect)) {
    const index = insertionIndex(list.items, { x, y }, 'horizontal')
    if (from?.id === list.deckId) {
      return { ok: true, act: 'reorder-cards', index, deckId: list.deckId, highlight: 'cards', label: 'Move here' }
    }
    if (list.alreadyHas) {
      return { ok: false, act: null, highlight: 'cards', label: `Already in ${list.deckName}` }
    }
    if (from && !subject.copy) {
      return { ok: true, act: 'move', index, deckId: list.deckId, highlight: 'cards', label: `Move to ${list.deckName}` }
    }
    return { ok: true, act: 'add', index, deckId: list.deckId, highlight: 'cards', label: `+1 → ${list.deckName}` }
  }

  const target = deckTargetAt(zones.deckTargets, x, y)
  if (target) {
    if (target.isVirtual) {
      return { ok: false, act: null, highlight: 'deck', highlightDeckId: target.id, label: 'The dictionary is read-only' }
    }
    // The source deck holds the card by definition, so this also covers
    // dropping a card straight back where it came from.
    if (target.alreadyHas) {
      return { ok: false, act: null, highlight: 'deck', highlightDeckId: target.id, label: `Already in ${target.name}` }
    }
    if (from && !subject.copy) {
      return { ok: true, act: 'move', deckId: target.id, highlight: 'deck', highlightDeckId: target.id, label: `Move to ${target.name}` }
    }
    return { ok: true, act: 'add', deckId: target.id, highlight: 'deck', highlightDeckId: target.id, label: `+1 → ${target.name}` }
  }

  // A new deck always copies, even from a sourced drag: "start a new deck from
  // this card" reads as making something, not as emptying the deck you are
  // looking at one card at a time.
  if (zones.library && pointInRect(x, y, zones.library)) {
    return { ok: true, act: 'new-deck', highlight: 'library', label: 'Start a new deck' }
  }
  if (zones.tray && pointInRect(x, y, zones.tray)) {
    return { ok: false, act: null, highlight: 'tray', label: 'Drop on a deck, not the table' }
  }
  return { ...NOTHING, label: 'Drop on one of your decks' }
}
