import { Fragment, useMemo } from 'react'
import type { SelectedCell } from './ChartDetailPanel'
import type { SyllableChart, SyllableChartCell, SyllableChartInitial } from '../types/syllable-chart'

/** Shared with SoundsView's `chartMatchingCells`/`soundsByCell` memos — must match exactly. */
export function chartCellKey(initial: string, rime: string): string {
  return `${initial} ${rime}`
}

function initialLabel(initial: string): string {
  return initial || '∅'
}

function initialTitle({ example, examplePengim }: SyllableChartInitial): string | undefined {
  if (!example) return undefined
  return examplePengim ? `${example} (${examplePengim})` : example
}

function cellAriaLabel(
  initial: string,
  rime: string,
  cell: SyllableChartCell | undefined,
  audioCoverageOn: boolean,
): string {
  const initialDesc = initial ? `${initial} initial` : 'no initial'
  if (!cell || cell.legalTones.length === 0) return `${initialDesc}, rime ${rime}: not a legal syllable`
  if (cell.attestedTones.length === 0) return `${initialDesc}, rime ${rime}: legal, unattested`
  const base = `${initialDesc}, rime ${rime}: attested, tones ${cell.attestedTones.join(', ')}`
  if (!audioCoverageOn) return base

  const stagedOnly = cell.stagedTones.filter((t) => !cell.recordedTones.includes(t))
  const parts: string[] = []
  if (cell.recordedTones.length > 0) parts.push(`${cell.recordedTones.length} recorded`)
  if (stagedOnly.length > 0) parts.push(`${stagedOnly.length} staged, pending review`)
  return parts.length > 0 ? `${base}; ${parts.join(', ')}` : base
}

function coverageClass(cell: SyllableChartCell): string {
  const stagedOnly = cell.stagedTones.filter((t) => !cell.recordedTones.includes(t))
  const covered = new Set([...cell.recordedTones, ...stagedOnly])
  if (covered.size === 0) return 'sounds-view__chart-cell--coverage-none'

  const intensity = covered.size >= cell.attestedTones.length ? 'all' : 'some'
  if (cell.recordedTones.length > 0 && stagedOnly.length > 0) return `sounds-view__chart-cell--coverage-mixed-${intensity}`
  if (cell.recordedTones.length > 0) return `sounds-view__chart-cell--coverage-${intensity}`
  return `sounds-view__chart-cell--coverage-staged-${intensity}`
}

/**
 * The Sounds tab's Chart view grid (issue #171): initials × rimes, sticky
 * header row and first column, rendered as one flat CSS Grid so
 * `grid-template-columns` + `position: sticky` behave correctly — every cell
 * (including row headers) is a direct child of the grid container. `Fragment`
 * groups a rime's cells for React's `key` without adding a wrapping DOM node
 * that would break that flatness.
 */
export function SyllableChartGrid({
  chart,
  selectedCell,
  onSelectCell,
  dimmedExcept,
  audioCoverageOn,
}: {
  chart: SyllableChart
  selectedCell: SelectedCell | null
  onSelectCell: (cell: SelectedCell) => void
  /** Set of cell keys to keep at full opacity; every other cell dims. `null` = nothing dimmed. */
  dimmedExcept: Set<string> | null
  audioCoverageOn: boolean
}) {
  const cellMap = useMemo(() => {
    const map = new Map<string, SyllableChartCell>()
    for (const cell of chart.cells) map.set(chartCellKey(cell.initial, cell.rime), cell)
    return map
  }, [chart])

  return (
    <div className="sounds-view__chart-grid-scroll">
      <div
        className="sounds-view__chart-grid"
        role="grid"
        aria-label="Syllable chart: initials by rime"
        style={{ gridTemplateColumns: `5rem repeat(${chart.initials.length}, minmax(4.25rem, 1fr))` }}
      >
        <div className="sounds-view__chart-corner" role="columnheader" aria-label="Rime" />
        {chart.initials.map((initial) => (
          <div
            key={initial.pengim}
            className="sounds-view__chart-col-header"
            role="columnheader"
            title={initialTitle(initial)}
            aria-label={`Initial ${initial.pengim || '(none)'}`}
          >
            {initialLabel(initial.pengim)}
          </div>
        ))}

        {chart.rimes.map((rime) => (
          <Fragment key={rime}>
            <div className="sounds-view__chart-row-header" role="rowheader" aria-label={`Rime ${rime}`}>
              {rime}
            </div>
            {chart.initials.map((initial) => {
              const cell = cellMap.get(chartCellKey(initial.pengim, rime))
              if (!cell) {
                return (
                  <div
                    key={initial.pengim}
                    className="sounds-view__chart-cell sounds-view__chart-cell--illegal"
                    aria-hidden="true"
                  />
                )
              }

              const attested = cell.attestedTones.length > 0
              const key = chartCellKey(initial.pengim, rime)
              const dimmed = dimmedExcept !== null && !dimmedExcept.has(key)
              const selected =
                selectedCell !== null && selectedCell.initial === initial.pengim && selectedCell.rime === rime

              const classNames = [
                'sounds-view__chart-cell',
                attested ? 'sounds-view__chart-cell--attested' : 'sounds-view__chart-cell--unattested',
              ]
              if (attested && audioCoverageOn) classNames.push(coverageClass(cell))
              if (selected) classNames.push('sounds-view__chart-cell--selected')
              if (dimmed) classNames.push('sounds-view__chart-cell--dimmed')

              return (
                <div
                  key={initial.pengim}
                  role="gridcell"
                  tabIndex={0}
                  title={cellAriaLabel(initial.pengim, rime, cell, audioCoverageOn)}
                  aria-label={cellAriaLabel(initial.pengim, rime, cell, audioCoverageOn)}
                  aria-selected={selected}
                  className={classNames.join(' ')}
                  onClick={() => onSelectCell({ initial: initial.pengim, rime })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectCell({ initial: initial.pengim, rime })
                    }
                  }}
                >
                  {cell.attestedTones.map((tone) => {
                    const recorded = cell.recordedTones.includes(tone)
                    const staged = !recorded && cell.stagedTones.includes(tone)
                    const toneClass =
                      audioCoverageOn && attested
                        ? recorded
                          ? 'sounds-view__chart-tone sounds-view__chart-tone--recorded'
                          : staged
                            ? 'sounds-view__chart-tone sounds-view__chart-tone--staged'
                            : 'sounds-view__chart-tone sounds-view__chart-tone--unrecorded'
                        : 'sounds-view__chart-tone'
                    return (
                      <span key={tone} className={toneClass}>
                        {tone}
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
