import type { EnrichedEntry } from '@teochew/core'
import { LevelBadge } from './LevelBadge'

export function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: EnrichedEntry
  selected: boolean
  onSelect: (id: string) => void
}) {
  const reading = entry.readings[0]
  const gloss = entry.senses[0]?.gloss_en.join(', ')
  return (
    <button
      type="button"
      className={selected ? 'entry-list__item entry-list__item--selected' : 'entry-list__item'}
      onClick={() => onSelect(entry.id)}
    >
      <span className="entry-list__headword">{entry.headword}</span>
      {entry.level && <LevelBadge level={entry.level} />}
      {reading && <span className="entry-list__pengim">{reading.pengim}</span>}
      {gloss && <span className="entry-list__gloss">{gloss}</span>}
    </button>
  )
}
