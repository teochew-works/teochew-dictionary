import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { resolveDrop } from './resolveDrop'
import type { DeckDropTarget, DragKind, DragSubject, DropOutcome, DropZones } from './resolveDrop'
import { nextGhostFrame } from './dragPhysics'
import type { GhostFrame } from './dragPhysics'
import { prefersReducedMotion } from './prefersReducedMotion'
import { isCopyModifier, isMacPlatform } from './copyModifier'
import type { Rect } from './geometry'

/** Pointer travel before a press becomes a drag, so a click on a deck's menu button stays a click. */
const DRAG_THRESHOLD_PX = 5
/** How long the drag image is held after a refused drop, so the refusal reads as a bounce. */
const REJECT_MS = 320

function rectOf(el: HTMLElement | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
}

/** Two outcomes that would paint identically — used to keep an unchanged drop out of React entirely. */
function sameOutcome(a: DropOutcome | null, b: DropOutcome | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.ok === b.ok &&
    a.act === b.act &&
    a.index === b.index &&
    a.deckId === b.deckId &&
    a.highlight === b.highlight &&
    a.highlightDeckId === b.highlightDeckId &&
    a.label === b.label
  )
}

export interface DeckDragActions {
  onPlay: (deckId: string, index: number) => void
  onReorderPlay: (deckId: string, index: number) => void
  onReorderLibrary: (deckId: string, index: number) => void
  onTakeOff: (deckId: string) => void
  onDelete: (deckId: string) => void
  onAddCard: (deckId: string, entryId: string) => void
  onMoveCard: (fromDeckId: string, toDeckId: string, entryId: string) => void
  onRemoveCard: (fromDeckId: string, entryId: string) => void
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
  /** What would happen on release right now. Only updated when it actually changes — see `sameOutcome`. */
  outcome: DropOutcome | null
  /** Whether the drag image should be mounted: during the drag, and through the reject bounce after it. */
  showGhost: boolean
  /** Attach to the drag image. Its transform is written straight to this element every frame, never through React. */
  ghostRef: (el: HTMLElement | null) => void
  /** Size of the element the drag started from, so the drag image can match it. */
  ghostSize: { width: number; height: number } | null
  /** True once the drag ended on a refused target — drives the reject bounce. */
  rejecting: boolean
  isDragging: (kind: DragKind, id: string) => boolean
  /** Start a drag from a deck card, a chip, the card's filing handle, or a browse-drawer entry. */
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
  /** The drag image's current position — for tests, which can't read a style attribute React never wrote. */
  readGhostFrame: () => GhostFrame | null
}

/**
 * One pointer-drag engine for every drag on the flashcards screen: a deck
 * out of the library, a chip around the table, the showing card into a
 * deck, an entry out of the browse drawer.
 *
 * The prototype this screen is built from resolves all four against the
 * same set of zones (see decks/dnd/resolveDrop.ts), which is what lets the
 * drag image carry a badge naming the outcome — `+18 cards`, `Already in
 * Travel`, `Delete deck` — instead of the caller having to guess. Splitting
 * the engine per-list would mean each half only knowing about its own
 * zones, and no single place able to say what a release would do.
 *
 * Deliberately hand-rolled on pointer events rather than the HTML5
 * drag-and-drop API or a library, matching this repo's preference for small
 * hand-written implementations (see srs/scheduler.ts's rationale): the
 * native API can't express a refusal state or a live count badge, and
 * behaves inconsistently on touch.
 *
 * Three things keep a drag off the render path, because a drag that stutters
 * is worse than one that is plain:
 *
 *  - The drag image's transform is written straight to the DOM in the rAF
 *    loop. Putting its position in React state re-renders this whole screen
 *    sixty times a second to move one element.
 *  - Drop resolution is coalesced into that same frame. A `pointermove`
 *    handler can fire far more often than the display refreshes (high-poll
 *    mice fire hundreds of times a second), and each resolution reads a
 *    dozen rects — which forces layout every time.
 *  - `setOutcome` runs only when the outcome would actually paint
 *    differently, so React sees a handful of updates per drag (the caret
 *    moving, the badge changing) rather than one per frame.
 */
export function useDeckDrag(context: DeckDragContext, actions: DeckDragActions, announce: (message: string) => void): DeckDrag {
  const [subject, setSubject] = useState<DragSubject | null>(null)
  const [outcome, setOutcome] = useState<DropOutcome | null>(null)
  const [ghostSize, setGhostSize] = useState<{ width: number; height: number } | null>(null)
  const [rejecting, setRejecting] = useState(false)

  const trayElRef = useRef<HTMLElement | null>(null)
  const libraryElRef = useRef<HTMLElement | null>(null)
  const trashElRef = useRef<HTMLElement | null>(null)
  const ghostElRef = useRef<HTMLElement | null>(null)
  const trayItemEls = useRef(new Map<string, HTMLElement>())
  const libraryItemEls = useRef(new Map<string, HTMLElement>())
  const deckTargetEls = useRef(new Map<string, { deckId: string; el: HTMLElement }>())

  const contextRef = useRef(context)
  contextRef.current = context
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const announceRef = useRef(announce)
  announceRef.current = announce
  const outcomeRef = useRef<DropOutcome | null>(null)
  /** Whether the platform's copy modifier is down right now — see decks/dnd/copyModifier.ts. */
  const copyHeldRef = useRef(false)
  const macRef = useRef(isMacPlatform())

  /** The drag image's current position and tilt; advanced by the rAF loop, never by React. */
  const frameRef = useRef<GhostFrame | null>(null)
  /** Where the drag image is heading — the pointer, less the grab offset. */
  const ghostTargetRef = useRef({ x: 0, y: 0 })

  /** Everything the live drag needs that must not re-subscribe the pointer listeners as it changes. */
  const pressRef = useRef<{
    subject: DragSubject
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    pointX: number
    pointY: number
    started: boolean
    outcome: DropOutcome | null
  } | null>(null)

  /*
   * Ref callbacks are cached per id. Returning a fresh function each render
   * makes React detach and re-attach every registered element on every
   * render — real DOM work, on the path a drag re-renders.
   */
  const refCache = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const cachedRef = useCallback((key: string, make: () => (el: HTMLElement | null) => void) => {
    let fn = refCache.current.get(key)
    if (!fn) {
      fn = make()
      refCache.current.set(key, fn)
    }
    return fn
  }, [])

  const trayItemRef = useCallback(
    (id: string) =>
      cachedRef(`tray:${id}`, () => (el: HTMLElement | null) => {
        if (el) trayItemEls.current.set(id, el)
        else trayItemEls.current.delete(id)
      }),
    [cachedRef],
  )

  const libraryItemRef = useCallback(
    (id: string) =>
      cachedRef(`lib:${id}`, () => (el: HTMLElement | null) => {
        if (el) libraryItemEls.current.set(id, el)
        else libraryItemEls.current.delete(id)
      }),
    [cachedRef],
  )

  const deckTargetRef = useCallback(
    (deckId: string, place: 'rail' | 'tray') => {
      const key = `${place}:${deckId}`
      return cachedRef(`target:${key}`, () => (el: HTMLElement | null) => {
        if (el) deckTargetEls.current.set(key, { deckId, el })
        else deckTargetEls.current.delete(key)
      })
    },
    [cachedRef],
  )

  const rectsFor = useCallback((ids: string[], store: Map<string, HTMLElement>, exclude: string): Rect[] => {
    return ids.flatMap((id) => {
      if (id === exclude) return []
      const rect = rectOf(store.get(id) ?? null)
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
    if (dragged.kind === 'deck' || dragged.kind === 'chip') {
      const info = contextRef.current.deckInfo(dragged.id)
      if (!info) return dragged
      return { ...dragged, deck: { name: info.name, isVirtual: info.isVirtual, kept: info.kept } }
    }
    if (!dragged.from) return dragged
    const info = contextRef.current.deckInfo(dragged.from.id)
    return {
      ...dragged,
      copy: copyHeldRef.current,
      from: info ? { id: dragged.from.id, name: info.name } : dragged.from,
    }
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
        trayItems: rectsFor(ctx.inPlayIds, trayItemEls.current, dragged.id),
        library: rectOf(libraryElRef.current),
        libraryItems: rectsFor(ctx.libraryIds, libraryItemEls.current, dragged.id),
        // The trash exists while a deck is in the air, and while a card is in
        // the air that came out of a deck and so has something to leave.
        trash: isDeckDrag || dragged.from ? rectOf(trashElRef.current) : null,
        deckTargets,
      }
    },
    [rectsFor],
  )

  const resolveNow = useCallback((): DropOutcome | null => {
    const press = pressRef.current
    if (!press?.started) return null
    const dragged = enrich(press.subject)
    const resolved = resolveDrop(dragged, zonesFor(dragged), press.pointX, press.pointY)
    press.outcome = resolved
    return resolved
  }, [enrich, zonesFor])

  const writeGhost = useCallback((frame: GhostFrame) => {
    frameRef.current = frame
    const el = ghostElRef.current
    if (!el) return
    el.style.transform = `translate3d(${frame.x.toFixed(1)}px, ${frame.y.toFixed(1)}px, 0) rotate(${frame.angle.toFixed(2)}deg) scale(1.045)`
  }, [])

  const ghostRef = useCallback(
    (el: HTMLElement | null) => {
      ghostElRef.current = el
      if (el && frameRef.current) writeGhost(frameRef.current)
    },
    [writeGhost],
  )

  // Pointer listeners live on the document for the whole press, so a drag
  // that leaves the source element (which is the normal case) keeps tracking.
  // They do no measuring: they only record where the pointer is, and the
  // frame loop below does the work once per frame.
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const press = pressRef.current
      if (!press) return

      press.pointX = e.clientX
      press.pointY = e.clientY
      copyHeldRef.current = isCopyModifier(e, macRef.current)
      ghostTargetRef.current = { x: e.clientX - press.offsetX, y: e.clientY - press.offsetY }

      if (!press.started) {
        if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD_PX) return
        press.started = true
        setSubject(press.subject)
        setRejecting(false)
      }
    }

    function handleUp() {
      const press = pressRef.current
      if (!press) return
      // A press released inside the same frame it started may not have been
      // resolved yet, so resolve once here rather than treating it as a refusal.
      const resolved = press.outcome ?? resolveNow()
      pressRef.current = null

      if (!press.started) {
        setSubject(null)
        return
      }

      const { subject: dragged } = press
      setSubject(null)
      setOutcome(null)
      outcomeRef.current = null

      if (!resolved || !resolved.ok || !resolved.act) {
        setRejecting(true)
        if (resolved?.label) announceRef.current(resolved.label)
        window.setTimeout(() => setRejecting(false), REJECT_MS)
        return
      }

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
        case 'move':
          if (resolved.deckId && dragged.from) a.onMoveCard(dragged.from.id, resolved.deckId, dragged.id)
          break
        case 'remove':
          if (dragged.from) a.onRemoveCard(dragged.from.id, dragged.id)
          break
        case 'new-deck':
          a.onNewDeckFromCard(dragged.id)
          break
        default: {
          // A new act that nobody handles would otherwise do nothing at all and
          // not even announce a refusal, since `ok` is true by this point.
          const unhandled: never = resolved.act
          throw new Error(`Unhandled drop act: ${String(unhandled)}`)
        }
      }
    }

    // Pressing or releasing the copy modifier without moving the pointer still
    // has to flip the badge, so the key state is tracked as well as read off
    // each pointermove. This effect subscribes once for the component's
    // lifetime — the rAF effect below re-runs per drag and must not be used.
    function handleModifier(e: KeyboardEvent) {
      if (!pressRef.current) return
      copyHeldRef.current = isCopyModifier(e, macRef.current)
    }

    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    document.addEventListener('pointercancel', handleUp)
    document.addEventListener('keydown', handleModifier)
    document.addEventListener('keyup', handleModifier)
    return () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointercancel', handleUp)
      document.removeEventListener('keydown', handleModifier)
      document.removeEventListener('keyup', handleModifier)
    }
  }, [resolveNow])

  /*
   * The whole per-frame cost of a drag, in one place: resolve the drop once,
   * tell React only if the answer changed, then advance the drag image and
   * write it to the DOM directly.
   *
   * Under reduced motion the image still exists and still carries its badge —
   * both are affordances, not decoration. It just sits exactly on the pointer
   * with no trailing and no tilt.
   */
  useEffect(() => {
    if (!subject) return
    const reduced = prefersReducedMotion()
    let lastTime: number | null = null

    let rafId = requestAnimationFrame(function tick(time: number) {
      const resolved = resolveNow()
      if (!sameOutcome(outcomeRef.current, resolved)) {
        outcomeRef.current = resolved
        setOutcome(resolved)
      }

      const target = ghostTargetRef.current
      if (reduced || !frameRef.current || lastTime === null) {
        writeGhost({ ...target, angle: 0 })
      } else {
        writeGhost(nextGhostFrame(frameRef.current, target, (time - lastTime) / 1000))
      }
      lastTime = time

      rafId = requestAnimationFrame(tick)
    })

    return () => cancelAnimationFrame(rafId)
  }, [subject, resolveNow, writeGhost])

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
        pointX: e.clientX,
        pointY: e.clientY,
        started: false,
        outcome: null,
      }
      copyHeldRef.current = isCopyModifier(e, macRef.current)
      ghostTargetRef.current = { x: rect.left, y: rect.top }
      frameRef.current = { x: rect.left, y: rect.top, angle: 0 }
      setGhostSize({ width: rect.width, height: rect.height })
    },
    [],
  )

  return {
    subject,
    outcome,
    showGhost: subject !== null || rejecting,
    ghostRef,
    ghostSize,
    rejecting,
    isDragging: (kind, id) => subject?.kind === kind && subject.id === id,
    onPointerDown,
    trayRef: useCallback((el: HTMLElement | null) => {
      trayElRef.current = el
    }, []),
    libraryRef: useCallback((el: HTMLElement | null) => {
      libraryElRef.current = el
    }, []),
    trashRef: useCallback((el: HTMLElement | null) => {
      trashElRef.current = el
    }, []),
    trayItemRef,
    libraryItemRef,
    deckTargetRef,
    readGhostFrame: () => frameRef.current,
  }
}
