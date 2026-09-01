import type { PipelineStageKey } from '@teochew/core'

export type FunnelStageKey = PipelineStageKey | 'queue'

export interface FunnelStage {
  key: FunnelStageKey
  label: string
  count: number
  /** 'cut' stages are ones a filter removed something at, and open the filters when clicked. */
  variant: 'start' | 'cut' | 'out'
}

/**
 * Where the session's cards went: what was on the table, what each filter
 * removed, and what reached the queue. Replaces the three bespoke
 * empty-state branches the old flat filter stack needed — an empty session
 * is explained by the stage that emptied it rather than just being empty.
 *
 * Only stages that actually changed the count are passed in (see
 * decks/pipeline.ts's significantStages), so the readout never restates a
 * number. Each of those is a button back into the filter that caused it.
 */
export function FunnelReadout({ stages, onOpenFilters }: { stages: FunnelStage[]; onOpenFilters: () => void }) {
  return (
    <div className="funnel" role="group" aria-label="How many cards survive each filter">
      {stages.map((stage) => {
        const className = `funnel__stage${stage.variant === 'start' ? '' : ` funnel__stage--${stage.variant}`}`
        const content = (
          <>
            <span className="funnel__n mono">{stage.count.toLocaleString()}</span>
            <span className="funnel__label">{stage.label}</span>
          </>
        )
        return stage.variant === 'cut' ? (
          <button key={stage.key} type="button" className={className} title="Open filters" onClick={onOpenFilters}>
            {content}
          </button>
        ) : (
          <div key={stage.key} className={className}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
