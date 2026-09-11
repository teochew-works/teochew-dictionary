import { visiblePronunciationFields, DEFAULT_PRONUNCIATION_DISPLAY } from '@teochew/core'
import type { EnrichedEntry, PronunciationField } from '@teochew/core'
import { LevelBadge } from './LevelBadge'

export function EntryRow({
  entry,
  selected,
  onSelect,
  pronunciationDisplay = DEFAULT_PRONUNCIATION_DISPLAY,
}: {
  entry: EnrichedEntry
  selected: boolean
  onSelect: (id: string) => void
  pronunciationDisplay?: PronunciationField[]
}) {
  const reading = entry.readings[0]
  const gloss = entry.senses[0]?.gloss_en.join(', ')
  const primaryField = reading && visiblePronunciationFields(reading, pronunciationDisplay)[0]
  return (
    <button
      type="button"
      className={selected ? 'entry-list__item entry-list__item--selected' : 'entry-list__item'}
      onClick={() => onSelect(entry.id)}
    >
      <span className="entry-list__headword">{entry.headword}</span>
      {entry.level && <LevelBadge level={entry.level} />}
      {reading && primaryField && <span className="entry-list__pronunciation">{reading[primaryField]}</span>}
      {gloss && <span className="entry-list__gloss">{gloss}</span>}
    </button>
  )
}
