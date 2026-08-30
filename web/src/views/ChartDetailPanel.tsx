import type { PublishedClip, LocalRecordingsStatus } from '../hooks/useLocalRecordingsStatus'
import { PlayClipButton, clipLabel } from '../components/PlayClipButton'
import { RecordClipButton, type RecordStatus } from '../components/RecordClipButton'
import { MogherPengim } from '../components/MogherPengim'
import type { Sound } from '../types/sounds'
import type { SyllableChartCell } from '../types/syllable-chart'

export interface SelectedCell {
  initial: string
  rime: string
}

/** `initial || '∅'` — the zero initial has no letter of its own to show. */
function cellLabel(cell: SelectedCell): string {
  return `${cell.initial || '∅'}${cell.rime}`
}

/**
 * The Sounds tab Chart view's persistent detail panel (issue #171): shows
 * one row per attested tone for the selected (initial, rime) cell, reusing
 * the exact `sound-row*` markup/CSS and the `PlayClipButton`/`RecordClipButton`
 * components SoundRow already uses — nothing reimplemented here.
 */
export function ChartDetailPanel({
  cell,
  chartCell,
  sounds,
  localRecordings,
  recordStatus,
  onSaved,
  playingId,
  onPlay,
  width,
  mogherLinks = false,
}: {
  cell: SelectedCell | null
  chartCell: SyllableChartCell | null
  sounds: Sound[]
  localRecordings: LocalRecordingsStatus | null
  recordStatus: (clips: PublishedClip[], pengim: string) => RecordStatus
  onSaved: (pengim: string) => void
  playingId: string | null
  onPlay: (id: string, url: string) => void
  /** User-resizable panel width in px (issue #171) — falls back to the CSS default when omitted. */
  width?: number
  /** Link each example entry's Peng'im out to mogher.com, per syllable (issue #173). */
  mogherLinks?: boolean
}) {
  const style = width !== undefined ? { width } : undefined

  return (
    <aside
      className={cell ? 'sounds-view__chart-detail sounds-view__chart-detail--open' : 'sounds-view__chart-detail'}
      aria-label="Cell detail"
      style={style}
    >
      {!cell || !chartCell ? (
        <p className="sounds-view__empty">Select a cell to see its syllables.</p>
      ) : chartCell.attestedTones.length === 0 ? (
        <>
          <h2 className="sounds-view__chart-detail-heading">{cellLabel(cell)}</h2>
          <p className="sounds-view__empty">Legal tones: {chartCell.legalTones.join(' ')} — none attested yet.</p>
        </>
      ) : (
        <>
          <h2 className="sounds-view__chart-detail-heading">{cellLabel(cell)}</h2>
          <ul className="sounds-view__rows">
            {chartCell.attestedTones.map((tone) => {
              const sound = sounds.find((s) => s.tone === tone)
              if (!sound) return null
              const clips = localRecordings?.published.get(sound.pengim) ?? sound.clips
              return (
                <li key={sound.pengim} className="sound-row sound-row--chart">
                  <span className="sounds-view__chart-tone-badge">{tone}</span>
                  <span className="sound-row__pengim">{sound.pengim}</span>
                  <span className="sound-row__ipa">{sound.ipa}</span>
                  <span className="sound-row__examples">
                    {sound.examples.length === 0 && (
                      <span className="sound-row__no-examples">no isolated example yet</span>
                    )}
                    {sound.examples.map((example, i) => (
                      <span key={i} className="sound-row__example">
                        <span className="sound-row__example-hanzi">{example.headword}</span>
                        <span className="sound-row__example-pengim">
                          {mogherLinks ? <MogherPengim pengim={example.pengim} /> : example.pengim}
                        </span>
                        <span className="sound-row__example-gloss">{example.gloss}</span>
                      </span>
                    ))}
                  </span>
                  {(clips.length > 0 || import.meta.env.DEV) && (
                    <span className="sound-row__controls">
                      {clips.length > 0 && (
                        <span className="sound-row__play-list">
                          {clips.map((clip, i) => (
                            <PlayClipButton
                              key={i}
                              id={`${sound.pengim}:${i}`}
                              clip={clip}
                              label={clipLabel(clip, i, clips.length)}
                              ariaLabel={
                                clip.speaker
                                  ? `Play recording by ${clip.speaker}`
                                  : clips.length > 1
                                    ? `Play recording ${i + 1}`
                                    : 'Play recording'
                              }
                              playingId={playingId}
                              onPlay={onPlay}
                            />
                          ))}
                        </span>
                      )}
                      {import.meta.env.DEV && (
                        <RecordClipButton
                          pengim={sound.pengim}
                          status={recordStatus(clips, sound.pengim)}
                          onSaved={onSaved}
                        />
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
