import type { SelectedCell } from '../views/ChartDetailPanel'
/** The Sounds tab's shareable sub-state (issue #226): sort mode, and in chart mode, the selected cell. */
export type SoundsRoute =
  | { mode: 'alphabetical' }
  | { mode: 'frequency' }
  | { mode: 'chart'; cell: SelectedCell | null }

export const DEFAULT_SOUNDS_ROUTE: SoundsRoute = { mode: 'alphabetical' }

/** Parses the part of the hash after `sounds/` (or `''` if there was none). */
export function parseSoundsRoute(rest: string): SoundsRoute {
  const slash = rest.indexOf('/')
  const mode = slash === -1 ? rest : rest.slice(0, slash)
  if (mode === 'frequency') return { mode: 'frequency' }
  if (mode === 'chart') {
    if (slash === -1) return { mode: 'chart', cell: null }
    const cellPart = rest.slice(slash + 1)
    const cellSlash = cellPart.indexOf('/')
    if (cellSlash === -1) return { mode: 'chart', cell: null }
    const initial = decodeURIComponent(cellPart.slice(0, cellSlash))
    const rime = decodeURIComponent(cellPart.slice(cellSlash + 1))
    return rime ? { mode: 'chart', cell: { initial, rime } } : { mode: 'chart', cell: null }
  }
  return DEFAULT_SOUNDS_ROUTE
}

/** Formats a `SoundsRoute` back into the part of the hash after `sounds/`. Alphabetical (the default) has no suffix. */
export function formatSoundsRoute(route: SoundsRoute): string {
  if (route.mode === 'frequency') return 'sounds/frequency'
  if (route.mode === 'chart') {
    if (!route.cell) return 'sounds/chart'
    return `sounds/chart/${encodeURIComponent(route.cell.initial)}/${encodeURIComponent(route.cell.rime)}`
  }
  return 'sounds'
}

