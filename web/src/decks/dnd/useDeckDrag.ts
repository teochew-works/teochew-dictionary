import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { resolveDrop } from './resolveDrop'
import type { DeckDropTarget, DragKind, DragSubject, DropOutcome, DropZones } from './resolveDrop'
import { nextGhostFrame } from './dragPhysics'
import type { GhostFrame } from './dragPhysics'
import { prefersReducedMotion } from './prefersReducedMotion'
import type { Rect } from './geometry'

/** Pointer travel before a press becomes a drag, so a click on a deck's menu button stays a click. */
const DRAG_THRESHOLD_PX = 5

function rectOf(el: HTMLElement | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

export interface DeckDragActions {
  onPlay: (deckId: string, index: number) => void
  onReorderPlay: (deckId: string, index: number) => void
  onReorderLibrary: (deckId: string, index: number) => void
  onTakeOff: (deckId: string) => void
  onDelete: (deckId: string) => void
  onAddCard: (deckId: string, entryId: string) => void
  onNewDeckFromCard: (entryId: string) => void
}

export interface DeckDragContext {
  /** Ordered in-play deck ids — the tray's display order. */
  inPlayIds: string[]
  /** Ordered user deck ids — the library list's display order. */
  libraryIds: string[]
  /** Everything a resolved drop needs to know about a deck, by id. */
  deckInfo: (deckId: string) => { name: string; isVirtual: boolean; kept: number; hasCard: (entryId: string) => boolean } | null
}

export interface DeckDrag {
  /** The live drag, or null before the pointer has moved past the threshold. */
  subject: DragSubject | null
  /** What would happen on release right now — badge text, zone highlight, and the mutation to run. */
  outcome: DropOutcome | null
  /** Where to paint the drag image. Pinned exactly to the pointer under reduced motion, trailing and tilted otherwise. */
  ghost: GhostFrame | null
  /** Size of the element the drag started from, so the drag image can match it. */
  ghostSize: { width: number; height: number } | null
  /** True once the drag ended on a refused target — drives the reject bounce before the image is dropped. */
  rejecting: boolean
  isDragging: (kind: DragKind, id: string) => boolean
  /** Start a drag from a grip, a chip, the card's filing handle, or a browse-drawer entry. */
  onPointerDown: (subject: DragSubject) => (e: ReactPointerEvent) => void
  trayRef: (el: HTMLElement | null) => void
  libraryRef: (el: HTMLElement | null) => void
  trashRef: (el: HTMLElement | null) => void
  trayItemRef: (id: string) => (el: HTMLElement | null) => void
  libraryItemRef: (id: string) => (el: HTMLElement | null) => void
  /**
   * Registers a deck row or chip as somewhere a card can be filed. The same
   * deck appears in both the rail and the tray, so `place` distinguishes the
   * two elements standing for one deck.
   */
  deckTargetRef: (deckId: string, place: 'rail' | 'tray') => (el: HTMLElement | null) => void
}

const REJECT_MS = 320

/**
 * One pointer-drag engine for every drag on the flashcards screen: a deck
 * out of the library, a chip around the table, the showing card into a
 * deck, an entry out of the browse drawer.
 *
 * The prototype this screen is built from resolves all four against the
 * same set of zones on every pointer move (see decks/dnd/resolveDrop.ts),
 * which is what lets the drag image carry a badge naming the outcome —
 * `+18 cards`, `Already in Travel`, `Delete deck` — instead of the caller
 * having to guess. Splitting the engine per-list would mean each half only
 * knowing about its own zones, and no single place able to say what a
 * release would do.
 *
 * Deliberately hand-rolled on pointer events rather than the HTML5
 * drag-and-drop API or a library, matching this repo's preference for small
 * hand-written implementations (see srs/scheduler.ts's rationale): the
 * native API can't express a refusal state or a live count badge, and
 * behaves inconsistently on touch.
 */
export function useDeckDrag(context: DeckDragContext, actions: DeckDragActions, announce: (message: string) => void): DeckDrag {
  const [subject, setSubject] = useState<DragSubject | null>(null)
  const [outcome, setOutcome] = useState<DropOutcome | null>(null)
  const [ghost, setGhost] = useState<GhostFrame | null>(null)
  const [ghostSize, setGhostSize] = useState<{ width: number; height: number } | null>(null)
  const [rejecting, setRejecting] = useState(false)

  const trayElRef = useRef<HTMLElement | null>(null)
  const libraryElRef = useRef<HTMLElement | null>(null)
  const trashElRef = useRef<HTMLElement | null>(null)
  const trayItemEls = useRef(new Map<string, HTMLElement>())
  const libraryItemEls = useRef(new Map<string, HTMLElement>())
  const deckTargetEls = useRef(new Map<string, { deckId: string; el: HTMLElement }>())

  const contextRef = useRef(context)
  contextRef.current = context
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const announceRef = useRef(announce)
  announceRef.current = announce

  /** Where the drag image is heading — the pointer, less the grab offset. Read by the animation loop every frame. */
  const pointerTargetRef = useRef({ x: 0, y: 0 })

  /** Everything the live drag needs that must not re-subscribe the pointer listeners as it changes. */
  const pressRef = useRef<{
    subject: DragSubject
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    started: boolean
    outcome: DropOutcome | null
  } | null>(null)

  const collectRef = useCallback((store: RefObject<Map<string, HTMLElement>>, id: string) => (el: HTMLElement | null) => {
    if (el) store.current.set(id, el)
    else store.current.delete(id)
  }, [])

  const trayItemRef = useCallback((id: string) => collectRef(trayItemEls, id), [collectRef])
  const libraryItemRef = useCallback((id: string) => collectRef(libraryItemEls, id), [collectRef])
  const deckTargetRef = useCallback(
    (deckId: string, place: 'rail' | 'tray') => (el: HTMLElement | null) => {
      const key = `${place}:${deckId}`
      if (el) deckTargetEls.current.set(key, { deckId, el })
      else deckTargetEls.current.delete(key)
    },
    [],
  )

  const rectsFor = useCallback((ids: string[], store: RefObject<Map<string, HTMLElement>>, exclude: string): Rect[] => {
    return ids.flatMap((id) => {
      if (id === exclude) return []
      const rect = rectOf(store.current.get(id) ?? null)
      return rect ? [rect] : []
    })
  }, [])

  /**
   * Fills in the dragged deck's name, kind, and surviving-card count from
   * live state. Callers only pass the kind and id, so a drag started before
   * a filter changed still promises the count that is true *now* rather than
   * the one that was true when the press began.
   */
  const enrich = useCallback((dragged: DragSubject): DragSubject => {
    if (dragged.kind !== 'deck' && dragged.kind !== 'chip') return dragged
    const info = contextRef.current.deckInfo(dragged.id)
    if (!info) return dragged
    return { ...dragged, deck: { name: info.name, isVirtual: info.isVirtual, kept: info.kept } }
  }, [])

  const zonesFor = useCallback(
    (dragged: DragSubject): DropZones => {
      const ctx = contextRef.current
      const isDeckDrag = dragged.kind === 'deck' || dragged.kind === 'chip'
      const deckTargets: DeckDropTarget[] = isDeckDrag
        ? []
        : [...deckTargetEls.current.values()].flatMap(({ deckId, el }) => {
            const info = ctx.deckInfo(deckId)
            const rect = rectOf(el)
            if (!info || !rect) return []
            return [{ id: deckId, name: info.name, rect, isVirtual: info.isVirtual, alreadyHas: info.hasCard(dragged.id) }]
          })

      return {
        tray: rectOf(trayElRef.current),
        trayItems: rectsFor(ctx.inPlayIds, trayItemEls, dragged.id),
        library: rectOf(libraryElRef.current),
        libraryItems: rectsFor(ctx.libraryIds, libraryItemEls, dragged.id),
        // The trash only exists while a deck is in the air, matching the prototype.
        trash: isDeckDrag ? rectOf(trashElRef.current) : null,
        deckTargets,
      }
    },
    [rectsFor],
  )

  // Pointer listeners live on the document for the whole press, so a drag
  // that leaves the source element (which is the normal case) keeps tracking.
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const press = pressRef.current
      if (!press) return

      if (!press.started) {
        if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD_PX) return
        press.started = true
        setSubject(press.subject)
        setRejecting(false)
      }

      const target = { x: e.clientX - press.offsetX, y: e.clientY - press.offsetY }
      setGhost((prev) => (prev ? prev : { ...target, angle: 0 }))

      const dragged = enrich(press.subject)
      const resolved = resolveDrop(dragged, zonesFor(dragged), e.clientX, e.clientY)
      press.outcome = resolved
      setOutcome(resolved)
      pointerTargetRef.current = target
    }

    function handleUp() {
      const press = pressRef.current
      pressRef.current = null
      if (!press) return
      if (!press.started) {
        setSubject(null)
        return
      }

      const resolved = press.outcome
      const { subject: dragged } = press
      setSubject(null)
      setOutcome(null)

      if (!resolved || !resolved.ok || !resolved.act) {
        setRejecting(true)
        if (resolved?.label) announceRef.current(resolved.label)
        window.setTimeout(() => {
          setRejecting(false)
          setGhost(null)
        }, REJECT_MS)
        return
      }

      setGhost(null)
      const a = actionsRef.current
      switch (resolved.act) {
        case 'play':
          a.onPlay(dragged.id, resolved.index ?? 0)
          break
        case 'reorder-play':
          a.onReorderPlay(dragged.id, resolved.index ?? 0)
          break
        case 'reorder-lib':
          a.onReorderLibrary(dragged.id, resolved.index ?? 0)
          break
        case 'off':
          a.onTakeOff(dragged.id)
          break
        case 'delete':
          a.onDelete(dragged.id)
          break
        case 'add':
          if (resolved.deckId) a.onAddCard(resolved.deckId, dragged.id)
          break
        case 'new-deck':
          a.onNewDeckFromCard(dragged.id)
          break
      }
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    document.addEventListener('pointercancel', handleUp)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointercancel', handleUp)
    }
  }, [zonesFor, enrich])

  // The drag image's own motion: it eases toward the pointer rather than
  // tracking it exactly, and the resulting lag is what tilts it. Under
  // reduced motion the image still exists — it just sits exactly on the
  // pointer, since the badge it carries is an affordance, not decoration.
  useEffect(() => {
    if (!subject) return
    if (prefersReducedMotion()) {
      let rafId = requestAnimationFrame(function pin() {
        setGhost({ ...pointerTargetRef.current, angle: 0 })
        rafId = requestAnimationFrame(pin)
      })
      return () => cancelAnimationFrame(rafId)
    }

    let lastTime: number | null = null
    let rafId = requestAnimationFrame(function tick(time: number) {
      if (lastTime !== null) {
        setGhost((prev) => (prev ? nextGhostFrame(prev, pointerTargetRef.current, (time - lastTime!) / 1000) : prev))
      }
      lastTime = time
      rafId = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(rafId)
  }, [subject])

  const onPointerDown = useCallback(
    (dragged: DragSubject) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return
      const el = e.currentTarget as HTMLElement
      const source = el.closest('[data-drag-source]') ?? el
      const rect = source.getBoundingClientRect()
      pressRef.current = {
        subject: dragged,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        started: false,
        outcome: null,
      }
      pointerTargetRef.current = { x: rect.left, y: rect.top }
      setGhost({ x: rect.left, y: rect.top, angle: 0 })
      setGhostSize({ width: rect.width, height: rect.height })
    },
    [],
  )

  return {
    subject,
    outcome,
    ghost: subject || rejecting ? ghost : null,
    ghostSize,
    rejecting,
    isDragging: (kind, id) => subject?.kind === kind && subject.id === id,
    onPointerDown,
    trayRef: (el) => {
      trayElRef.current = el
    },
    libraryRef: (el) => {
      libraryElRef.current = el
    },
    trashRef: (el) => {
      trashElRef.current = el
    },
    trayItemRef,
    libraryItemRef,
    deckTargetRef,
  }
}
