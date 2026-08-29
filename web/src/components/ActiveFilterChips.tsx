export interface ActiveFilterChip {
  key: string
  label: string
  onRemove: () => void
}

/** Echoes each non-default filter outside the FiltersPopover, so an active filter is never hidden from view — see issue #187. */
export function ActiveFilterChips({ chips }: { chips: ActiveFilterChip[] }) {
  if (chips.length === 0) return null
  return (
    <ul className="active">
      {chips.map((chip) => (
        <li key={chip.key} className="active__chip">
          {chip.label}
          <button
            type="button"
            className="active__chip-remove"
            aria-label={`Remove filter: ${chip.label}`}
            onClick={chip.onRemove}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path d="M1.3 1.3l5.4 5.4M6.7 1.3L1.3 6.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  )
}
