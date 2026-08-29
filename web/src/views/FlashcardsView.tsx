import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSrsQueue } from '../srs/useSrsQueue'
import { newCardState, previewIntervals } from '../srs/scheduler'
import { Flashcard } from '../components/Flashcard'
import { DeckTray } from '../components/DeckTray'
import { DeckRail } from '../components/DeckRail'
import { DragGhost } from '../components/DragGhost'
import { GroupPresets } from '../components/GroupPresets'
import { Drawer } from '../components/Drawer'
import { DictionaryBrowser } from '../components/DictionaryBrowser'
import { DeckContents } from '../components/DeckContents'
import { EntryDeckMenu } from '../components/EntryDeckMenu'
import { PromptModeControl } from '../components/PromptModeControl'
import { FiltersPopover } from '../components/FiltersPopover'
import { ActiveFilterChips } from '../components/ActiveFilterChips'
import type { ActiveFilterChip } from '../components/ActiveFilterChips'
import { FunnelReadout } from '../components/FunnelReadout'
import type { FunnelStage } from '../components/FunnelReadout'
import { StudyEmptyState } from '../components/StudyEmptyState'
import { LiveRegion } from '../components/LiveRegion'
import { Toasts } from '../components/Toasts'
import { useToasts } from '../flashcards/useToasts'
import { useDeckDrag } from '../decks/dnd/useDeckDrag'
import { useDeckLift } from '../decks/dnd/useDeckLift'
import { useFlip } from '../decks/dnd/useFlip'
import type { CardDropState } from '../components/DeckCard'
import type { EnrichedEntry } from '../types/dict'
import { PROMPT_MODE_LABELS, readPromptMode, writePromptMode } from '../flashcards/promptMode'
import type { PromptMode } from '../flashcards/promptMode'
import {
  DEFAULT_LEVEL_FILTER,
  LEVEL_FILTER_ORDER,
  levelFilterLabel,
  readLevelFilter,
  writeLevelFilter,
} from '../flashcards/levelFilter'
import type { LevelFilterValue } from '../flashcards/levelFilter'
import { readFullAudioOnly, writeFullAudioOnly } from '../settings/fullAudioOnly'
import { DEFAULT_PRONUNCIATION_MODE, readPronunciationMode, writePronunciationMode } from '../settings/pronunciationMode'
import type { PronunciationMode } from '../settings/pronunciationMode'
import { useDecksStore } from '../decks/useDecksStore'
import type { DecksState } from '../decks/storage'
import { makeDictionaryDeck } from '../decks/virtualDeck'
import { deckStats } from '../decks/stats'
import type { DeckFilters, DeckStats } from '../decks/stats'
import { firstEmptyStage, resolveDecks, runDeckPipeline, significantStages, stageCount } from '../decks/pipeline'
import type { Deck } from '../decks/types'
import './FlashcardsView.css'

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v))
}

type ItemRef = (el: HTMLElement | null) => void

/**
 * Composes the several per-deck element refs a card needs — drag source,
 * FLIP measurement, card drop target — into one, cached per deck id.
 *
 * Without the cache each render hands React a brand-new ref function for
 * every deck, so React detaches and re-attaches every element: real DOM work
 * on the path a drag re-renders. The factories are read through a ref so the
 * composed function itself never has to change.
 */
function useComposedItemRef(...factories: ((id: string) => ItemRef)[]): (id: string) => ItemRef {
  const cache = useRef(new Map<string, ItemRef>())
  const factoriesRef = useRef(factories)
  factoriesRef.current = factories

  return useCallback((id: string) => {
    let composed = cache.current.get(id)
    if (!composed) {
      composed = (el) => {
        for (const factory of factoriesRef.current) factory(id)(el)
      }
      cache.current.set(id, composed)
    }
    return composed
  }, [])
}

const EMPTY_STATS: DeckStats = { total: 0, kept: 0, due: 0, fresh: 0, learned: 0 }

/**
 * The flashcards screen: a library of decks on the left, the decks in play
 * on the table across the top, and the card under review below.
 *
 * Two ideas hold it together. Everything on the table is shuffled into one
 * queue, so practising four decks together is the same gesture as
 * practising one. And the filters apply to that whole pool rather than to
 * any single deck, which is why the funnel in the session bar reports what
 * each stage removed — an empty session gets explained instead of just
 * being empty.
 *
 * This component owns the drag engine and the lift (keyboard) state for the
 * whole screen, because a drag that starts in the rail can end on the table
 * and vice versa: neither half can resolve a drop on its own. See
 * decks/dnd/useDeckDrag.ts.
 */
export function FlashcardsView({ entries }: { entries: EnrichedEntry[] }) {
  const decksStore = useDecksStore()
  const [mode, setMode] = useState<PromptMode>(readPromptMode)
  const [pronunciation, setPronunciation] = useState<PronunciationMode>(readPronunciationMode)
  const [levelFilter, setLevelFilter] = useState<Set<LevelFilterValue>>(readLevelFilter)
  const [fullAudioOnly, setFullAudioOnly] = useState<boolean>(readFullAudioOnly)
  const [announcement, setAnnouncement] = useState('')
  const announce = useCallback((message: string) => setAnnouncement(message), [])
  /** What the bottom dock is showing: nothing, the dictionary, or one deck's cards. */
  const [drawer, setDrawer] = useState<{ mode: 'dictionary' } | { mode: 'deck'; deckId: string } | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [renaming, setRenaming] = useState<{ deckId: string; value: string } | null>(null)
  const [filingMenuFor, setFilingMenuFor] = useState<string | null>(null)
  const toasts = useToasts()

  const dictionaryDeck = useMemo(() => makeDictionaryDeck(entries), [entries])
  const userDecks = decksStore.state.decks
  const allDecks = useMemo(() => [dictionaryDeck, ...userDecks], [dictionaryDeck, userDecks])
  const decksById = useMemo(() => new Map(allDecks.map((d) => [d.id, d])), [allDecks])
  const inPlayIds = decksStore.state.inPlay
  const libraryIds = useMemo(() => userDecks.map((d) => d.id), [userDecks])
  const inPlayDecks = useMemo(() => resolveDecks(inPlayIds, allDecks), [inPlayIds, allDecks])
  const nameOf = useCallback((id: string) => decksById.get(id)?.name ?? id, [decksById])

  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const filters: DeckFilters = useMemo(() => ({ mode, levelFilter, fullAudioOnly }), [mode, levelFilter, fullAudioOnly])

  const pipeline = useMemo(
    () => runDeckPipeline({ decks: allDecks, inPlay: inPlayIds, entryById, mode, levelFilter, fullAudioOnly }),
    [allDecks, inPlayIds, entryById, mode, levelFilter, fullAudioOnly],
  )
  const eligibleEntries = pipeline.entries
  /*
   * Identifies the table for the review session, so each set of decks keeps
   * its own place in its own queue. Sorted, because reordering the chips
   * rearranges the table without changing which decks are on it.
   */
  const tableKey = useMemo(() => [...inPlayIds].sort().join('|'), [inPlayIds])
  const { current, cardStates, reviewedCount, totalCount, loading, persistError, grade } = useSrsQueue(
    eligibleEntries,
    tableKey,
  )

  const statsById = useMemo(() => {
    const map = new Map<string, DeckStats>()
    for (const deck of allDecks) map.set(deck.id, deckStats(deck, entryById, cardStates, filters))
    return map
  }, [allDecks, entryById, cardStates, filters])

  const totals = useMemo(() => {
    let due = 0
    let fresh = 0
    let learned = 0
    const now = Date.now()
    for (const entry of eligibleEntries) {
      const state = cardStates.get(entry.id)
      if (!state) fresh += 1
      else if (new Date(state.dueAt).getTime() <= now) due += 1
      else learned += 1
    }
    return { pool: eligibleEntries.length, due, fresh, learned }
  }, [eligibleEntries, cardStates])

  /* ── writes ──────────────────────────────────────────────────────── */

  // Every destructive or table-replacing change is announced *and* toasted
  // with an Undo that puts the whole state back, which is what lets this
  // screen delete a deck without first asking whether you meant it.
  const snapshotRef = useRef<DecksState>(decksStore.state)
  snapshotRef.current = decksStore.state
  const withUndo = useCallback(
    (message: string) => {
      const before = snapshotRef.current
      announce(message)
      toasts.push(message, () => decksStore.restore(before))
    },
    [announce, toasts, decksStore],
  )
  const note = useCallback(
    (message: string) => {
      announce(message)
      toasts.push(message)
    },
    [announce, toasts],
  )

  function handleModeChange(next: PromptMode) {
    setMode(next)
    writePromptMode(next)
  }

  function handlePronunciationChange(next: PronunciationMode) {
    setPronunciation(next)
    writePronunciationMode(next)
  }

  function handleLevelFilterChange(next: Set<LevelFilterValue>) {
    setLevelFilter(next)
    writeLevelFilter(next)
  }

  function handleLevelToggle(value: LevelFilterValue) {
    const next = new Set(levelFilter)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    handleLevelFilterChange(next)
  }

  function handleFullAudioOnlyChange(next: boolean) {
    setFullAudioOnly(next)
    writeFullAudioOnly(next)
  }

  const createDeck = useCallback(() => {
    const id = decksStore.createDeck('New deck')
    setRenaming({ deckId: id, value: 'New deck' })
  }, [decksStore])

  const newDeckFromCard = useCallback(
    (entryId: string) => {
      const entry = entryById.get(entryId)
      if (!entry) return
      const id = decksStore.createDeck(`${entry.headword} & co.`, [entryId])
      withUndo(`New deck from ${entry.headword}`)
      setRenaming({ deckId: id, value: `${entry.headword} & co.` })
    },
    [decksStore, entryById, withUndo],
  )

  const addCard = useCallback(
    (deckId: string, entryId: string) => {
      const deck = decksById.get(deckId)
      const entry = entryById.get(entryId)
      if (!deck || !entry) return
      if (deck.cards.includes(entryId)) {
        note(`${entry.headword} is already in ${deck.name}`)
        return
      }
      decksStore.addCardToDeck(deckId, entryId)
      withUndo(`${entry.headword} → ${deck.name}`)
    },
    [decksById, entryById, decksStore, note, withUndo],
  )

  const removeCard = useCallback(
    (deckId: string, entryId: string) => {
      const deck = decksById.get(deckId)
      const entry = entryById.get(entryId)
      if (!deck || !deck.cards.includes(entryId)) return
      decksStore.removeCardFromDeck(deckId, entryId)
      withUndo(`Removed ${entry?.headword ?? 'card'} from ${deck.name}`)
    },
    [decksById, entryById, decksStore, withUndo],
  )

  const savePoolAsDeck = useCallback(() => {
    if (eligibleEntries.length === 0) return
    const bits: string[] = []
    if (!setEquals(levelFilter, DEFAULT_LEVEL_FILTER)) bits.push([...levelFilter].map(levelFilterLabel).join('/'))
    if (fullAudioOnly) bits.push('fully recorded')
    const name = `Pool · ${bits.length > 0 ? bits.join(' · ') : PROMPT_MODE_LABELS[mode]}`
    decksStore.createDeck(
      name,
      eligibleEntries.map((e) => e.id),
    )
    withUndo(`Saved ${eligibleEntries.length.toLocaleString()} cards as “${name}”`)
  }, [eligibleEntries, levelFilter, fullAudioOnly, mode, decksStore, withUndo])

  /* ── drag and keyboard lift ──────────────────────────────────────── */

  const dragContext = useMemo(
    () => ({
      inPlayIds,
      libraryIds,
      deckInfo: (deckId: string) => {
        const deck = decksById.get(deckId)
        if (!deck) return null
        return {
          name: deck.name,
          isVirtual: deck.kind === 'virtual',
          kept: statsById.get(deckId)?.kept ?? 0,
          hasCard: (entryId: string) => deck.cards.includes(entryId),
        }
      },
    }),
    [inPlayIds, libraryIds, decksById, statsById],
  )

  const dragActions = useMemo(
    () => ({
      onPlay: (deckId: string, index: number) => {
        decksStore.moveToPlay(deckId, index)
        note(`${nameOf(deckId)} is on the table`)
      },
      onReorderPlay: (deckId: string, index: number) => decksStore.moveToPlay(deckId, index),
      onReorderLibrary: (deckId: string, index: number) => {
        const without = libraryIds.filter((id) => id !== deckId)
        const at = Math.max(0, Math.min(index, without.length))
        decksStore.reorderDecks([...without.slice(0, at), deckId, ...without.slice(at)])
      },
      onTakeOff: (deckId: string) => {
        decksStore.removeFromPlay(deckId)
        withUndo(`${nameOf(deckId)} taken off the table`)
      },
      onDelete: (deckId: string) => {
        const name = nameOf(deckId)
        decksStore.deleteDeck(deckId)
        withUndo(`Deleted ${name}`)
      },
      onAddCard: addCard,
      onNewDeckFromCard: newDeckFromCard,
    }),
    [decksStore, libraryIds, nameOf, note, withUndo, addCard, newDeckFromCard],
  )

  const drag = useDeckDrag(dragContext, dragActions, announce)

  const lift = useDeckLift(
    libraryIds,
    inPlayIds,
    useMemo(
      () => ({
        onReorderLibrary: decksStore.reorderDecks,
        onReorderPlay: decksStore.reorderPlay,
        onPlay: decksStore.moveToPlay,
        onTakeOff: decksStore.removeFromPlay,
        onRestore: (library: string[], play: string[]) => {
          decksStore.reorderDecks(library)
          decksStore.setInPlay(play)
        },
      }),
      [decksStore],
    ),
    announce,
    nameOf,
  )

  // A lifted deck that crosses between the rail and the table is re-rendered
  // as a different element, so focus has to be handed to its new home or the
  // keyboard user loses the thing they are holding.
  const { liftedId, liftedKind } = lift
  useEffect(() => {
    if (!liftedId || !liftedKind) return
    const place = liftedKind === 'chip' ? 'tray' : 'rail'
    const el = document.querySelector<HTMLElement>(`[data-deck-id="${liftedId}"][data-place="${place}"]`)
    el?.focus()
  }, [liftedId, liftedKind])

  const railFlip = useFlip(libraryIds)
  const trayFlip = useFlip(inPlayIds)
  const railItemRef = useComposedItemRef(drag.libraryItemRef, railFlip.itemRef, useCallback((id: string) => drag.deckTargetRef(id, 'rail'), [drag]))
  const trayItemRef = useComposedItemRef(drag.trayItemRef, trayFlip.itemRef, useCallback((id: string) => drag.deckTargetRef(id, 'tray'), [drag]))
  const dictionaryRef = drag.deckTargetRef(dictionaryDeck.id, 'rail')

  const viewedDeck = drawer?.mode === 'deck' ? (decksById.get(drawer.deckId) ?? null) : null
  const drawerOpen = drawer?.mode === 'dictionary' || viewedDeck !== null

  const outcome = drag.outcome
  const trayCaret =
    outcome?.highlight === 'tray' && (outcome.act === 'play' || outcome.act === 'reorder-play') ? (outcome.index ?? null) : null
  const libraryCaret = outcome?.highlight === 'library' && outcome.act === 'reorder-lib' ? (outcome.index ?? null) : null
  const cardDropFor = useCallback(
    (deckId: string): CardDropState => {
      if (outcome?.highlight !== 'deck' || outcome.highlightDeckId !== deckId) return null
      return outcome.ok ? 'accept' : 'refuse'
    },
    [outcome],
  )

  const ghostContent = useMemo(() => {
    const subject = drag.subject
    if (!subject) return { title: '', subtitle: '', hue: 'var(--color-muted)' }
    if (subject.kind === 'deck' || subject.kind === 'chip') {
      const deck = decksById.get(subject.id)
      const stats = statsById.get(subject.id) ?? EMPTY_STATS
      return {
        title: deck?.name ?? subject.id,
        subtitle: `${stats.kept.toLocaleString()} cards`,
        hue: deck ? `var(--deck-hue-${deck.hue}-bg)` : 'var(--color-muted)',
      }
    }
    const entry = entryById.get(subject.id)
    return {
      title: entry?.headword ?? subject.id,
      subtitle: entry?.readings[0]?.pengim ?? '',
      hue: 'var(--color-accent)',
    }
  }, [drag.subject, decksById, statsById, entryById])

  /* ── session bar ─────────────────────────────────────────────────── */

  const significant = significantStages(pipeline.stages)
  const stageLabels: Record<string, string> = {
    'in-play': 'in play',
    mode: PROMPT_MODE_LABELS[mode].toLowerCase(),
    level: 'level',
    audio: 'audio',
  }
  const funnelStages: FunnelStage[] = [
    ...significant.map((stage, i) => ({
      key: stage.key,
      label: stageLabels[stage.key] ?? stage.key,
      count: stage.count,
      variant: i === 0 ? ('start' as const) : ('cut' as const),
    })),
    { key: 'queue' as const, label: 'to review', count: totalCount, variant: 'out' as const },
  ]

  const activeFilterChips: ActiveFilterChip[] = []
  if (!setEquals(levelFilter, DEFAULT_LEVEL_FILTER)) {
    const label = [...levelFilter].map(levelFilterLabel)
    activeFilterChips.push({
      key: 'level',
      label: label.length > 0 ? label.join(' ') : 'no levels',
      onRemove: () => handleLevelFilterChange(new Set(DEFAULT_LEVEL_FILTER)),
    })
  }
  if (fullAudioOnly) {
    activeFilterChips.push({ key: 'audio', label: 'fully recorded', onRemove: () => handleFullAudioOnlyChange(false) })
  }
  // Sandhi is this app's default (see settings/pronunciationMode.ts), so it's
  // citation that counts as a deliberate, worth-echoing choice here.
  if (pronunciation !== DEFAULT_PRONUNCIATION_MODE) {
    activeFilterChips.push({
      key: 'pron',
      label: 'citation tones',
      onRemove: () => handlePronunciationChange(DEFAULT_PRONUNCIATION_MODE),
    })
  }

  /* ── study surface ───────────────────────────────────────────────── */

  const currentEntry = current ? entryById.get(current.entryId) : null
  const sourceDeck = useMemo<Deck | null>(() => {
    if (!currentEntry) return null
    return inPlayDecks.find((d) => d.kind === 'user' && d.cards.includes(currentEntry.id)) ?? null
  }, [currentEntry, inPlayDecks])
  const intervals = useMemo(
    () => previewIntervals(currentEntry ? (cardStates.get(currentEntry.id) ?? newCardState(currentEntry.id)) : newCardState('')),
    [currentEntry, cardStates],
  )

  const emptyStage = firstEmptyStage(pipeline.stages)

  function renderStudy() {
    if (emptyStage?.key === 'in-play') {
      return (
        <StudyEmptyState
          title="The table is empty"
          body="Drag a deck out of the library, or start from the whole dictionary."
          fixLabel="Put the Dictionary in play"
          onFix={() => decksStore.moveToPlay(dictionaryDeck.id, 0)}
        />
      )
    }
    if (emptyStage?.key === 'mode') {
      return (
        <StudyEmptyState
          title="Nothing can be prompted this way"
          body={`No card on the table has what the ${PROMPT_MODE_LABELS[mode]} prompt needs.`}
          fixLabel="Prompt with Chinese instead"
          onFix={() => handleModeChange('chinese')}
        />
      )
    }
    if (emptyStage?.key === 'level') {
      return (
        <StudyEmptyState
          title="No cards at these levels"
          body={`${stageCount(pipeline.stages, 'mode').toLocaleString()} cards are on the table, but none are tagged ${
            [...levelFilter].map(levelFilterLabel).join(', ') || '—'
          }.`}
          fixLabel="Include every level"
          onFix={() => handleLevelFilterChange(new Set(DEFAULT_LEVEL_FILTER))}
        />
      )
    }
    if (emptyStage?.key === 'audio') {
      return (
        <StudyEmptyState
          title="No recordings for these cards yet"
          body={`${stageCount(pipeline.stages, 'level').toLocaleString()} cards pass your other filters, but none are fully recorded. Coverage is still partial.`}
          fixLabel="Drop the recording filter"
          onFix={() => handleFullAudioOnlyChange(false)}
        />
      )
    }
    if (!currentEntry) {
      return (
        <StudyEmptyState
          title="Table cleared"
          body={`You have reviewed everything due across ${inPlayDecks.length} deck${
            inPlayDecks.length === 1 ? '' : 's'
          }. Add another deck, or come back tomorrow.`}
        />
      )
    }
    return (
      <>
        <Flashcard
          key={currentEntry.id}
          entry={currentEntry}
          mode={mode}
          pronunciation={pronunciation}
          sourceDeck={sourceDeck}
          intervals={intervals}
          filing={{
            onPointerDown: drag.onPointerDown({ kind: 'card', id: currentEntry.id }),
            dragging: drag.isDragging('card', currentEntry.id),
            menuOpen: filingMenuFor === currentEntry.id,
            onOpenMenu: () => setFilingMenuFor(currentEntry.id),
            menu: filingMenuFor === currentEntry.id && (
              <EntryDeckMenu
                headword={currentEntry.headword}
                entryId={currentEntry.id}
                userDecks={userDecks}
                align="right"
                onAddCard={(deckId) => addCard(deckId, currentEntry.id)}
                onRemoveCard={(deckId) => removeCard(deckId, currentEntry.id)}
                onNewDeck={() => newDeckFromCard(currentEntry.id)}
                onClose={() => setFilingMenuFor(null)}
              />
            ),
          }}
          onGrade={grade}
        />
        <div className="study__note">
          <b>{reviewedCount.toLocaleString()} reviewed</b>
          {` · ${Math.max(0, totalCount - reviewedCount).toLocaleString()} left in this session · drawn from ${
            inPlayDecks.length
          } deck${inPlayDecks.length === 1 ? '' : 's'} on the table`}
        </div>
      </>
    )
  }

  if (loading) {
    return <p className="flashcards-view__status">Loading your review queue…</p>
  }

  return (
    <div className="flashcards-view">
      <LiveRegion message={announcement} />

      <div className="shell">
        <DeckRail
          dictionaryDeck={dictionaryDeck}
          userDecks={userDecks}
          statsById={statsById}
          inPlayIds={inPlayIds}
          libraryRef={drag.libraryRef}
          trashRef={drag.trashRef}
          itemRef={railItemRef}
          dictionaryRef={dictionaryRef}
          caretIndex={libraryCaret}
          libraryOver={outcome?.highlight === 'library'}
          trashArmed={drag.subject?.kind === 'deck' || drag.subject?.kind === 'chip'}
          trashOver={outcome?.highlight === 'trash'}
          isDragging={(id) => drag.isDragging('deck', id)}
          isLifted={(id) => lift.isLifted('deck', id)}
          cardDropFor={cardDropFor}
          renaming={
            renaming
              ? {
                  deckId: renaming.deckId,
                  value: renaming.value,
                  onChange: (value) => setRenaming({ deckId: renaming.deckId, value }),
                  onCommit: () => {
                    if (renaming.value.trim()) decksStore.renameDeck(renaming.deckId, renaming.value.trim())
                    setRenaming(null)
                  },
                  onCancel: () => setRenaming(null),
                }
              : null
          }
          menuActionsFor={(deck) => ({
            onPutOnTable: () => {
              decksStore.addToPlay(deck.id)
              note(`${deck.name} is on the table`)
            },
            onViewCards: () => setDrawer({ mode: 'deck', deckId: deck.id }),
            onRename: () => setRenaming({ deckId: deck.id, value: deck.name }),
            onDuplicate: () => {
              decksStore.duplicateDeck(deck.id)
              withUndo(`Duplicated ${deck.name}`)
            },
            onDelete: () => {
              decksStore.deleteDeck(deck.id)
              withUndo(`Deleted ${deck.name}`)
            },
          })}
          onPointerDown={(id) => drag.onPointerDown({ kind: 'deck', id })}
          onKeyDown={(id, e) => lift.handleKeyDown('deck', id, e)}
          onRenameRequest={(deck) => setRenaming({ deckId: deck.id, value: deck.name })}
          onCreateDeck={createDeck}
        />

        <div className="main">
          <DeckTray
            inPlayDecks={inPlayDecks}
            statsById={statsById}
            totals={totals}
            trayRef={drag.trayRef}
            itemRef={trayItemRef}
            isOver={outcome?.highlight === 'tray'}
            caretIndex={trayCaret}
            isDragging={(id) => drag.isDragging('chip', id)}
            isLifted={(id) => lift.isLifted('chip', id)}
            cardDropFor={cardDropFor}
            onRemove={(id) => {
              decksStore.removeFromPlay(id)
              withUndo(`${nameOf(id)} taken off the table`)
            }}
            onPointerDown={(id) => drag.onPointerDown({ kind: 'chip', id })}
            onKeyDown={(id, e) => lift.handleKeyDown('chip', id, e)}
          >
            <GroupPresets
              groups={decksStore.state.groups}
              decksById={decksById}
              currentInPlay={inPlayIds}
              onSave={(name) => {
                decksStore.saveGroup(name, inPlayIds)
                note(`Saved “${name}”`)
              }}
              onLoad={(groupId) => {
                const group = decksStore.state.groups.find((g) => g.id === groupId)
                decksStore.loadGroup(groupId)
                withUndo(`Loaded ${group?.name ?? 'group'}`)
              }}
              onDelete={(groupId) => {
                const group = decksStore.state.groups.find((g) => g.id === groupId)
                decksStore.deleteGroup(groupId)
                withUndo(`Deleted ${group?.name ?? 'group'}`)
              }}
            />
          </DeckTray>

          <div className="bar">
            <PromptModeControl mode={mode} onChange={handleModeChange} />

            <FiltersPopover open={filtersOpen} onOpenChange={setFiltersOpen} activeCount={activeFilterChips.length}>
              <div className="pop__group">
                <div className="pop__row">
                  <span className="eyebrow">Levels</span>
                  <button
                    type="button"
                    className="pop__reset"
                    onClick={() =>
                      handleLevelFilterChange(
                        setEquals(levelFilter, DEFAULT_LEVEL_FILTER) ? new Set() : new Set(DEFAULT_LEVEL_FILTER),
                      )
                    }
                  >
                    {setEquals(levelFilter, DEFAULT_LEVEL_FILTER) ? 'None' : 'All'}
                  </button>
                </div>
                <div className="chips">
                  {LEVEL_FILTER_ORDER.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="chipbtn"
                      aria-pressed={levelFilter.has(value)}
                      onClick={() => handleLevelToggle(value)}
                    >
                      {levelFilterLabel(value)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pop__group">
                <span className="eyebrow">Recording</span>
                <div className="seg">
                  <button type="button" aria-pressed={!fullAudioOnly} onClick={() => handleFullAudioOnlyChange(false)}>
                    Any
                  </button>
                  <button type="button" aria-pressed={fullAudioOnly} onClick={() => handleFullAudioOnlyChange(true)}>
                    Fully recorded
                  </button>
                </div>
              </div>

              <div className="pop__group">
                <span className="eyebrow">Tones shown</span>
                <div className="seg">
                  <button
                    type="button"
                    aria-pressed={pronunciation === 'citation'}
                    onClick={() => handlePronunciationChange('citation')}
                  >
                    Citation
                  </button>
                  <button
                    type="button"
                    aria-pressed={pronunciation === 'sandhi'}
                    onClick={() => handlePronunciationChange('sandhi')}
                  >
                    Sandhi
                  </button>
                </div>
              </div>

              <div className="pop__foot">Filters run across everything on the table — your decks and the dictionary alike.</div>
            </FiltersPopover>

            <ActiveFilterChips chips={activeFilterChips} />

            <div className="bar__spacer" />

            <FunnelReadout stages={funnelStages} onOpenFilters={() => setFiltersOpen(true)} />

            <button
              type="button"
              className="pill"
              aria-expanded={drawer?.mode === 'dictionary'}
              onClick={() => setDrawer((d) => (d?.mode === 'dictionary' ? null : { mode: 'dictionary' }))}
            >
              {drawer?.mode === 'dictionary' ? '✕ Done adding' : '＋ Add cards'}
            </button>
          </div>

          {persistError && (
            <p className="flashcards-view__warning">
              ⚠ Your progress can't be saved in this browser ({persistError}). You can still review this session.
            </p>
          )}

          <section className="study">{renderStudy()}</section>

          <Drawer open={drawerOpen} label={viewedDeck ? `Cards in ${viewedDeck.name}` : 'Browse the dictionary'}>
            {viewedDeck ? (
              <DeckContents
                deck={viewedDeck}
                entryById={entryById}
                pronunciation={pronunciation}
                userDecks={userDecks}
                cardDrag={{
                  onPointerDown: (entryId) => drag.onPointerDown({ kind: 'entry', id: entryId }),
                  isDragging: (entryId) => drag.isDragging('entry', entryId),
                }}
                onAddCard={addCard}
                onRemoveCard={removeCard}
                onNewDeckFromCard={newDeckFromCard}
                onBrowseDictionary={() => setDrawer({ mode: 'dictionary' })}
              />
            ) : (
              <DictionaryBrowser
                entries={entries}
                userDecks={userDecks}
                pronunciation={pronunciation}
                poolSize={eligibleEntries.length}
                cardDrag={{
                  onPointerDown: (entryId) => drag.onPointerDown({ kind: 'entry', id: entryId }),
                  isDragging: (entryId) => drag.isDragging('entry', entryId),
                }}
                onAddCard={addCard}
                onRemoveCard={removeCard}
                onNewDeckFromCard={newDeckFromCard}
                onSavePoolAsDeck={savePoolAsDeck}
              />
            )}
          </Drawer>
        </div>
      </div>

      <DragGhost
        visible={drag.showGhost}
        elementRef={drag.ghostRef}
        size={drag.ghostSize}
        content={ghostContent}
        outcome={drag.outcome}
        rejecting={drag.rejecting}
      />
      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  )
}
