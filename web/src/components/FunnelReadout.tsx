import type { PipelineStageKey } from '../decks/pipeline'

export type FunnelStageKey = PipelineStageKey | 'queue'

export interface FunnelStage {
  key: FunnelStageKey
  count: number
}

const STAGE_LABELS: Record<FunnelStageKey, string> = {
  'in-play': 'in play',
  mode: 'mode',
  level: 'level',
  audio: 'audio',
  queue: 'to review',
}

/**
 * Replaces the three bespoke empty-state branches the old flat filter stack
 * needed (issue #187) with one readout: "1,248 in play → 892 level → 34 to
 * review". FlashcardsView already collapsed `stages` to just the ones that
 * changed anything (decks/pipeline.ts's significantStages) before handing
 * them here.
 */
export function FunnelReadout({ stages }: { stages: FunnelStage[] }) {
  const text = stages.map((s) => `${s.count.toLocaleString()} ${STAGE_LABELS[s.key]}`).join(' → ')
  return <p className="flashcards-view__funnel">{text}</p>
}
