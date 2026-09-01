import type { EnrichedEntry } from '../enrichedEntry.js'
import type { Deck } from './types.js'
import { isEligibleForMode } from '../flashcards/promptMode.js'
import type { PromptMode } from '../flashcards/promptMode.js'
import { isEligibleForLevel } from '../flashcards/levelFilter.js'
import type { LevelFilterValue } from '../flashcards/levelFilter.js'
import { hasFullAudio } from '../search/filters.js'

export type PipelineStageKey = 'in-play' | 'mode' | 'level' | 'audio'

export interface PipelineStage {
  key: PipelineStageKey
  count: number
}

export interface DeckPipelineResult {
  /** The entries eligible for review after every stage below. */
  entries: EnrichedEntry[]
  /** One entry per stage, in pipeline order, regardless of whether that stage actually removed anything — see significantStages. */
  stages: PipelineStage[]
}

export interface DeckPipelineInput {
  /** Every known deck (the virtual dictionary deck plus user decks) — used to resolve `inPlay` ids. */
  decks: Deck[]
  /** Ordered deck ids currently on the table. */
  inPlay: string[]
  /** The currently loaded dictionary, keyed by id. */
  entryById: Map<string, EnrichedEntry>
  mode: PromptMode
  levelFilter: Set<LevelFilterValue>
  fullAudioOnly: boolean
}

/**
 * The whole review pool, start to finish: resolve `inPlay` deck ids to
 * decks, union their cards (de-duplicated, first-seen order — a deck's own
 * order, then table order), then narrow by prompt mode, level, and audio.
 *
 * Pure and React-free like srs/scheduler.ts, so the union/de-dup logic and
 * every filter stage are unit-testable in isolation. A deck id in `inPlay`
 * with no matching entry in `decks` (a deleted deck) and a card id with no
 * matching entry in `entryById` (a stale id after a lexicon rebuild) are
 * both silently skipped rather than treated as errors.
 */
export function runDeckPipeline(input: DeckPipelineInput): DeckPipelineResult {
  const deckById = new Map(input.decks.map((d) => [d.id, d]))

  const seen = new Set<string>()
  const union: EnrichedEntry[] = []
  for (const deckId of input.inPlay) {
    const deck = deckById.get(deckId)
    if (!deck) continue
    for (const cardId of deck.cards) {
      if (seen.has(cardId)) continue
      const entry = input.entryById.get(cardId)
      if (!entry) continue
      seen.add(cardId)
      union.push(entry)
    }
  }

  const afterMode = union.filter((e) => isEligibleForMode(e, input.mode))
  const afterLevel = afterMode.filter((e) => isEligibleForLevel(e, input.levelFilter))
  const afterAudio = input.fullAudioOnly ? afterLevel.filter(hasFullAudio) : afterLevel

  return {
    entries: afterAudio,
    stages: [
      { key: 'in-play', count: union.length },
      { key: 'mode', count: afterMode.length },
      { key: 'level', count: afterLevel.length },
      { key: 'audio', count: afterAudio.length },
    ],
  }
}

/** Resolves deck ids to decks, silently dropping ids with no matching deck — the display equivalent of the pipeline's own lookup. */
export function resolveDecks(deckIds: string[], decks: Deck[]): Deck[] {
  const deckById = new Map(decks.map((d) => [d.id, d]))
  return deckIds.map((id) => deckById.get(id)).filter((d): d is Deck => d !== undefined)
}

/**
 * Collapses consecutive stages that removed nothing, so the funnel reads
 * e.g. "1,248 in play → 892 level → 34 to review" instead of restating a
 * count that didn't change. The first stage is always kept as the starting
 * point.
 */
export function significantStages(stages: PipelineStage[]): PipelineStage[] {
  const result: PipelineStage[] = []
  let last: number | null = null
  for (const stage of stages) {
    if (stage.count !== last) {
      result.push(stage)
      last = stage.count
    }
  }
  return result
}

/** The first stage that hit zero — the one responsible for an empty review pool. */
export function firstEmptyStage(stages: PipelineStage[]): PipelineStage | null {
  return stages.find((s) => s.count === 0) ?? null
}

export function stageCount(stages: PipelineStage[], key: PipelineStageKey): number {
  return stages.find((s) => s.key === key)?.count ?? 0
}
