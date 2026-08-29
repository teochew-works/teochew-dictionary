export interface ActiveFilterChip {
  key: string
  label: string
  onRemove: () => void
}

/** Echoes each non-default filter outside the FiltersPopover, so an active filter is never hidden from view — see issue #187. */
export function ActiveFilterChips({ chips }: { chips: ActiveFilterChip[] }) {
  if (chips.length === 0) return null
  return (
    <ul className="active-filter-chips">
      {chips.map((chip) => (
        <li key={chip.key} className="filter-chip">
          {chip.label}
          <button
            type="button"
            className="filter-chip__remove"
            aria-label={`Remove filter: ${chip.label}`}
            onClick={chip.onRemove}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
