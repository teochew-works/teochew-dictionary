import { useCallback, useMemo, useState } from 'react'
import { useSrsQueue } from '../srs/useSrsQueue'
import { Flashcard } from '../components/Flashcard'
import { DeckTable } from '../components/DeckTable'
import { DeckRail } from '../components/DeckRail'
import { GroupPresets } from '../components/GroupPresets'
import { BrowseDrawer } from '../components/BrowseDrawer'
import { CardFileControls } from '../components/CardFileControls'
import { PromptModeControl } from '../components/PromptModeControl'
import { FiltersPopover } from '../components/FiltersPopover'
import { ActiveFilterChips } from '../components/ActiveFilterChips'
import type { ActiveFilterChip } from '../components/ActiveFilterChips'
import { FunnelReadout } from '../components/FunnelReadout'
import type { FunnelStage } from '../components/FunnelReadout'
import { LiveRegion } from '../components/LiveRegion'
import { useCardDrag } from '../decks/dnd/useCardDrag'
import type { DropZoneHandle } from '../decks/dnd/useDragReorder'
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
import { readPronunciationMode, writePronunciationMode } from '../settings/pronunciationMode'
import type { PronunciationMode } from '../settings/pronunciationMode'
import { useDecksStore } from '../decks/useDecksStore'
import { makeDictionaryDeck } from '../decks/virtualDeck'
import { firstEmptyStage, resolveDecks, runDeckPipeline, significantStages } from '../decks/pipeline'
import type { PipelineStageKey } from '../decks/pipeline'
import './FlashcardsView.css'

function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v))
}

const EMPTY_STAGE_MESSAGES: Record<PipelineStageKey, (mode: PromptMode) => string> = {
  'in-play': () => 'No cards are in play — add a deck to the table to start reviewing.',
  mode: (mode) => `No entries are available for ${PROMPT_MODE_LABELS[mode]} mode yet — try a different mode.`,
  level: () => 'No entries match the selected levels — try including more levels.',
  audio: () => 'No entries have fully recorded audio yet — try unchecking "Only fully recorded audio."',
}

export function FlashcardsView({ entries }: { entries: EnrichedEntry[] }) {
  const decksStore = useDecksStore()
  const [mode, setMode] = useState<PromptMode>(readPromptMode)
  const [pronunciation, setPronunciation] = useState<PronunciationMode>(readPronunciationMode)
  const [levelFilter, setLevelFilter] = useState<Set<LevelFilterValue>>(readLevelFilter)
  const [fullAudioOnly, setFullAudioOnly] = useState<boolean>(readFullAudioOnly)
  const [announcement, setAnnouncement] = useState('')
  const announce = useCallback((message: string) => setAnnouncement(message), [])
  const [browseDrawerOpen, setBrowseDrawerOpen] = useState(false)
  const [tableDropZone, setTableDropZone] = useState<DropZoneHandle | null>(null)
  const [incomingTablePreviewIndex, setIncomingTablePreviewIndex] = useState<number | null>(null)

  const dictionaryDeck = useMemo(() => makeDictionaryDeck(entries), [entries])
  const userDecks = decksStore.state.decks
  const allDecks = useMemo(() => [dictionaryDeck, ...userDecks], [dictionaryDeck, userDecks])
  const nameById = useMemo(() => new Map(allDecks.map((d) => [d.id, d.name])), [allDecks])
  const inPlayIds = decksStore.state.inPlay
  const inPlayDecks = useMemo(() => resolveDecks(inPlayIds, allDecks), [inPlayIds, allDecks])
  const availableDecks = useMemo(
    () => allDecks.filter((d) => !inPlayIds.includes(d.id)),
    [allDecks, inPlayIds],
  )

  function handleModeChange(next: PromptMode) {
    setMode(next)
    writePromptMode(next)
  }

  function handlePronunciationToggle(checked: boolean) {
    const next: PronunciationMode = checked ? 'sandhi' : 'citation'
    setPronunciation(next)
    writePronunciationMode(next)
  }

  function handleLevelFilterChange(next: Set<LevelFilterValue>) {
    setLevelFilter(next)
    writeLevelFilter(next)
  }

  function handleLevelToggle(value: LevelFilterValue, checked: boolean) {
    const next = new Set(levelFilter)
    if (checked) next.add(value)
    else next.delete(value)
    handleLevelFilterChange(next)
  }

  function handleFullAudioOnlyChange(next: boolean) {
    setFullAudioOnly(next)
    writeFullAudioOnly(next)
  }

  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const pipeline = useMemo(
    () =>
      runDeckPipeline({
        decks: allDecks,
        inPlay: inPlayIds,
        entryById,
        mode,
        levelFilter,
        fullAudioOnly,
      }),
    [allDecks, inPlayIds, entryById, mode, levelFilter, fullAudioOnly],
  )
  const eligibleEntries = pipeline.entries
  const emptyStage = firstEmptyStage(pipeline.stages)

  const { current, reviewedCount, totalCount, loading, persistError, grade } = useSrsQueue(eligibleEntries)

  const currentEntry = current ? entryById.get(current.entryId) : null

  const handleFileCard = useCallback(
    (deckId: string) => {
      if (!currentEntry) return
      decksStore.addCardToDeck(deckId, currentEntry.id)
      announce(`Added ${currentEntry.headword} to ${nameById.get(deckId) ?? deckId}.`)
    },
    [currentEntry, decksStore, announce, nameById],
  )
  const cardDropTargets = useMemo(() => allDecks.map((d) => ({ id: d.id, isVirtual: d.kind === 'virtual' })), [allDecks])
  const cardDrag = useCardDrag({
    targets: cardDropTargets,
    onFile: handleFileCard,
    onRefused: (deckId) => announce(`Can't file a card into ${nameById.get(deckId) ?? deckId} — it's read-only.`),
  })

  const significant = significantStages(pipeline.stages)
  const lastSignificantCount = significant[significant.length - 1]?.count ?? 0
  const funnelStages: FunnelStage[] =
    totalCount !== lastSignificantCount ? [...significant, { key: 'queue', count: totalCount }] : significant

  const activeFilterChips: ActiveFilterChip[] = []
  if (!setEquals(levelFilter, DEFAULT_LEVEL_FILTER)) {
    const label = [...levelFilter].map(levelFilterLabel)
    activeFilterChips.push({
      key: 'level',
      label: `Levels: ${label.length > 0 ? label.join(', ') : 'none'}`,
      onRemove: () => handleLevelFilterChange(new Set(DEFAULT_LEVEL_FILTER)),
    })
  }
  if (fullAudioOnly) {
    activeFilterChips.push({
      key: 'audio',
      label: 'Full audio only',
      onRemove: () => handleFullAudioOnlyChange(false),
    })
  }

  if (loading) {
    return <p className="flashcards-view__status">Loading your review queue…</p>
  }

  return (
    <div className="flashcards-view">
      <LiveRegion message={announcement} />

      <div className="flashcards-view__layout">
        <div className="flashcards-view__rail">
          <DeckRail
            dictionaryDeck={dictionaryDeck}
            userDecks={userDecks}
            inPlayIds={inPlayIds}
            onAddToTable={decksStore.addToPlay}
            onCreateDeck={decksStore.createDeck}
            onRenameDeck={decksStore.renameDeck}
            onDeleteDeck={decksStore.deleteDeck}
            onReorderDecks={decksStore.reorderDecks}
            onOpenBrowseDrawer={() => setBrowseDrawerOpen(true)}
            announce={announce}
            cardDrop={{ targetRef: cardDrag.targetRef, overId: cardDrag.overId }}
            crossListDrop={
              tableDropZone
                ? {
                    dropZone: tableDropZone,
                    zoneLabel: 'the table',
                    onMove: decksStore.moveToPlay,
                    onPreviewChange: setIncomingTablePreviewIndex,
                  }
                : undefined
            }
          />
        </div>

        <div className="flashcards-view__main">
          <DeckTable
            inPlayDecks={inPlayDecks}
            availableDecks={availableDecks}
            onAdd={decksStore.addToPlay}
            onRemove={decksStore.removeFromPlay}
            onReorder={decksStore.reorderPlay}
            announce={announce}
            onDropZoneChange={setTableDropZone}
            incomingPreviewIndex={incomingTablePreviewIndex}
          />

          <GroupPresets
            groups={decksStore.state.groups}
            currentInPlay={inPlayIds}
            onSave={(name) => decksStore.saveGroup(name, inPlayIds)}
            onLoad={decksStore.loadGroup}
            onDelete={decksStore.deleteGroup}
          />

          <div className="flashcards-view__session-bar">
            <PromptModeControl mode={mode} onChange={handleModeChange} />

            <FiltersPopover>
              <label className="flashcards-view__toggle">
                <input
                  type="checkbox"
                  checked={pronunciation === 'sandhi'}
                  onChange={(e) => handlePronunciationToggle(e.target.checked)}
                />
                Use sandhi pronunciation
              </label>

              <label className="flashcards-view__toggle">
                <input
                  type="checkbox"
                  checked={fullAudioOnly}
                  onChange={(e) => handleFullAudioOnlyChange(e.target.checked)}
                />
                Only fully recorded audio
              </label>

              <fieldset className="flashcards-view__levels">
                <legend>Levels</legend>
                {LEVEL_FILTER_ORDER.map((value) => (
                  <label key={value} className="flashcards-view__level-toggle">
                    <input
                      type="checkbox"
                      checked={levelFilter.has(value)}
                      onChange={(e) => handleLevelToggle(value, e.target.checked)}
                    />
                    {levelFilterLabel(value)}
                  </label>
                ))}
              </fieldset>
            </FiltersPopover>
          </div>

          <ActiveFilterChips chips={activeFilterChips} />

          <FunnelReadout stages={funnelStages} />

          {persistError && (
            <p className="flashcards-view__warning">
              ⚠ Your progress can't be saved in this browser ({persistError}). You can still review this session.
            </p>
          )}

          <p className="flashcards-view__progress">
            {reviewedCount} reviewed{totalCount > 0 ? ` · ${totalCount} in this session` : ''}
          </p>

          {emptyStage ? (
            <p className="flashcards-view__status">{EMPTY_STAGE_MESSAGES[emptyStage.key](mode)}</p>
          ) : currentEntry ? (
            <>
              <Flashcard key={currentEntry.id} entry={currentEntry} mode={mode} pronunciation={pronunciation} onGrade={grade} />
              {userDecks.length > 0 && (
                <CardFileControls
                  headword={currentEntry.headword}
                  userDecks={userDecks}
                  dragging={cardDrag.isDragging}
                  onPointerDown={cardDrag.onPointerDown}
                  onFile={handleFileCard}
                />
              )}
            </>
          ) : (
            <p className="flashcards-view__status">
              Nothing due right now — come back later, or check back tomorrow for new cards.
            </p>
          )}
        </div>
      </div>

      {browseDrawerOpen && (
        <BrowseDrawer
          entries={entries}
          userDecks={userDecks}
          onAddCard={decksStore.addCardToDeck}
          onRemoveCard={decksStore.removeCardFromDeck}
          onClose={() => setBrowseDrawerOpen(false)}
        />
      )}
    </div>
  )
}
