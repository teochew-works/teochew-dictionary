/**
 * A ranked, possibly-empty subset of the speakers recorded anywhere in the
 * loaded dictionary (issue #274) — modeled directly on
 * `PronunciationDisplayControl`. No drag — plain ↑/↓ buttons move a selected
 * speaker within the ranking, and buttons below re-add any excluded speaker
 * to the end. Unlike that control, an empty ranking is valid (and the
 * default): it means "no preference", falling back to the build's own
 * default clip order everywhere.
 */
export function SpeakerPreferenceControl({
  speakers,
  availableSpeakers,
  onChange,
}: {
  speakers: string[]
  availableSpeakers: string[]
  onChange: (speakers: string[]) => void
}) {
  const excluded = availableSpeakers.filter((speaker) => !speakers.includes(speaker))

  function swap(a: number, b: number) {
    const next = [...speakers]
    const temp = next[a]!
    next[a] = next[b]!
    next[b] = temp
    onChange(next)
  }

  function moveUp(index: number) {
    if (index === 0) return
    swap(index - 1, index)
  }

  function moveDown(index: number) {
    if (index === speakers.length - 1) return
    swap(index, index + 1)
  }

  function remove(speaker: string) {
    onChange(speakers.filter((s) => s !== speaker))
  }

  function add(speaker: string) {
    onChange([...speakers, speaker])
  }

  return (
    <div className="speaker-preference">
      {speakers.length > 0 && (
        <ul className="speaker-preference__list">
          {speakers.map((speaker, index) => (
            <li key={speaker} className="speaker-preference__item">
              <span className="speaker-preference__label">{speaker}</span>
              <button
                type="button"
                className="speaker-preference__move"
                onClick={() => moveUp(index)}
                disabled={index === 0}
                aria-label={`Move ${speaker} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className="speaker-preference__move"
                onClick={() => moveDown(index)}
                disabled={index === speakers.length - 1}
                aria-label={`Move ${speaker} down`}
              >
                ↓
              </button>
              <button
                type="button"
                className="speaker-preference__remove"
                onClick={() => remove(speaker)}
                aria-label={`Remove ${speaker}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {excluded.length > 0 && (
        <div className="speaker-preference__add">
          {excluded.map((speaker) => (
            <button type="button" key={speaker} className="settings-view__button" onClick={() => add(speaker)}>
              + {speaker}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
