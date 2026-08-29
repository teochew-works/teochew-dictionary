import { useMemo, useState } from 'react'
import { useSrsQueue } from '../srs/useSrsQueue'
import { Flashcard } from '../components/Flashcard'
import type { EnrichedEntry } from '../types/dict'
import { PROMPT_MODE_LABELS, readPromptMode, writePromptMode } from '../flashcards/promptMode'
import type { PromptMode } from '../flashcards/promptMode'
import { LEVEL_FILTER_ORDER, levelFilterLabel, readLevelFilter, writeLevelFilter } from '../flashcards/levelFilter'
import type { LevelFilterValue } from '../flashcards/levelFilter'
import { readFullAudioOnly, writeFullAudioOnly } from '../settings/fullAudioOnly'
import { readPronunciationMode, writePronunciationMode } from '../settings/pronunciationMode'
import type { PronunciationMode } from '../settings/pronunciationMode'
import { useDecksStore } from '../decks/useDecksStore'
import { makeDictionaryDeck, DICTIONARY_DECK_ID } from '../decks/virtualDeck'
import { runDeckPipeline, stageCount } from '../decks/pipeline'
import './FlashcardsView.css'

/**
 * Stage 1 of issue #187: entries are now sourced through the deck pipeline
 * instead of directly from the `entries` prop, but the visible UI still
 * only ever has one deck to pick — the virtual dictionary deck — until
 * stage 4 adds deck creation. Selecting a (future) deck here writes through
 * to the same `inPlay` list stage 2's table will manage, so today's choice
 * of deck already survives a reload.
 */
export function FlashcardsView({ entries }: { entries: EnrichedEntry[] }) {
  const decksStore = useDecksStore()
  const [mode, setMode] = useState<PromptMode>(readPromptMode)
  const [pronunciation, setPronunciation] = useState<PronunciationMode>(readPronunciationMode)
  const [levelFilter, setLevelFilter] = useState<Set<LevelFilterValue>>(readLevelFilter)
  const [fullAudioOnly, setFullAudioOnly] = useState<boolean>(readFullAudioOnly)

  const dictionaryDeck = useMemo(() => makeDictionaryDeck(entries), [entries])
  const allDecks = useMemo(() => [dictionaryDeck, ...decksStore.state.decks], [dictionaryDeck, decksStore.state.decks])
  const selectedDeckId = decksStore.state.inPlay[0] ?? DICTIONARY_DECK_ID

  function handleDeckChange(deckId: string) {
    decksStore.setInPlay([deckId])
  }

  function handleModeChange(next: PromptMode) {
    setMode(next)
    writePromptMode(next)
  }

  function handlePronunciationToggle(checked: boolean) {
    const next: PronunciationMode = checked ? 'sandhi' : 'citation'
    setPronunciation(next)
    writePronunciationMode(next)
  }

  function handleLevelToggle(value: LevelFilterValue, checked: boolean) {
    const next = new Set(levelFilter)
    if (checked) next.add(value)
    else next.delete(value)
    setLevelFilter(next)
    writeLevelFilter(next)
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
        inPlay: decksStore.state.inPlay,
        entryById,
        mode,
        levelFilter,
        fullAudioOnly,
      }),
    [allDecks, decksStore.state.inPlay, entryById, mode, levelFilter, fullAudioOnly],
  )
  const eligibleEntries = pipeline.entries
  const inPlayCount = stageCount(pipeline.stages, 'in-play')
  const modeCount = stageCount(pipeline.stages, 'mode')
  const levelCount = stageCount(pipeline.stages, 'level')
  const audioCount = stageCount(pipeline.stages, 'audio')

  const { current, reviewedCount, totalCount, loading, persistError, grade } = useSrsQueue(eligibleEntries)

  const currentEntry = current ? entryById.get(current.entryId) : null

  if (loading) {
    return <p className="flashcards-view__status">Loading your review queue…</p>
  }

  return (
    <div className="flashcards-view">
      <select
        className="flashcards-view__deck"
        aria-label="Deck"
        value={selectedDeckId}
        onChange={(e) => handleDeckChange(e.target.value)}
      >
        {allDecks.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>

      <select
        className="flashcards-view__mode"
        aria-label="Flashcard prompt"
        value={mode}
        onChange={(e) => handleModeChange(e.target.value as PromptMode)}
      >
        {Object.entries(PROMPT_MODE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

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

      {persistError && (
        <p className="flashcards-view__warning">
          ⚠ Your progress can't be saved in this browser ({persistError}). You can still review this session.
        </p>
      )}

      <p className="flashcards-view__progress">
        {reviewedCount} reviewed{totalCount > 0 ? ` · ${totalCount} in this session` : ''}
      </p>

      {inPlayCount > 0 && modeCount === 0 ? (
        <p className="flashcards-view__status">
          No entries are available for {PROMPT_MODE_LABELS[mode]} mode yet — try a different mode.
        </p>
      ) : modeCount > 0 && levelCount === 0 ? (
        <p className="flashcards-view__status">
          No entries match the selected levels — try including more levels.
        </p>
      ) : levelCount > 0 && audioCount === 0 ? (
        <p className="flashcards-view__status">
          No entries have fully recorded audio yet — try unchecking "Only fully recorded audio."
        </p>
      ) : currentEntry ? (
        <Flashcard key={currentEntry.id} entry={currentEntry} mode={mode} pronunciation={pronunciation} onGrade={grade} />
      ) : (
        <p className="flashcards-view__status">
          Nothing due right now — come back later, or check back tomorrow for new cards.
        </p>
      )}
    </div>
  )
}
