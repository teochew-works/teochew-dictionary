import type { AudioReference, EnrichedReading } from '../types/dict'

/**
 * Clip buttons for one reading. Mirrors src/cli/lookup.ts's ordering and
 * glyphs: the whole-word clip first as ♪♪, then one ♪ button per syllable
 * that has a recording.
 *
 * Both are offered when both exist rather than the word clip suppressing the
 * syllables — a word recording carries connected-speech coarticulation a
 * syllable clip can't (data/phonology/REVIEW.md § 16), but the syllables stay
 * reachable for drilling one at a time.
 *
 * Renders nothing when the reading has no clips at all, which is every reading
 * today: data/phonology/audio/*.yaml doesn't exist yet (issues #36/#37).
 */
export function ReadingAudio({
  reading,
  readingIndex,
  playingId,
  onPlay,
}: {
  reading: EnrichedReading
  /** Disambiguates this reading's clip ids from every other reading's on the
   *  same entry, so two readings that happen to share a clip url don't share
   *  playing state. */
  readingIndex: number
  playingId: string | null
  onPlay: (id: string, url: string) => void
}) {
  const hasSyllableClip = reading.audio.some((c) => c !== null)
  if (!reading.wordAudio && !hasSyllableClip) return null

  return (
    <div className="reading__audio">
      {reading.wordAudio && (
        <ClipButton
          id={`${readingIndex}:word`}
          clip={reading.wordAudio}
          glyph="♪♪"
          label={`Play whole-word recording of ${reading.wordAudio.key}`}
          modifier="reading__clip--word"
          playingId={playingId}
          onPlay={onPlay}
        />
      )}
      {reading.audio.map(
        (clip, i) =>
          clip && (
            // Id (and key) carry the syllable's own slot, not a reduplicated
            // clip's url: a reading like "mang7 mang7" resolves both
            // syllables to the same clip, and they must still act — and be
            // keyed — as two distinct buttons.
            <ClipButton
              key={i}
              id={`${readingIndex}:syllable-${i}`}
              clip={clip}
              glyph="♪"
              label={`Play recording of syllable ${clip.key}`}
              playingId={playingId}
              onPlay={onPlay}
            />
          ),
      )}
    </div>
  )
}

function ClipButton({
  id,
  clip,
  glyph,
  label,
  modifier,
  playingId,
  onPlay,
}: {
  id: string
  clip: AudioReference
  glyph: string
  label: string
  modifier?: string
  playingId: string | null
  onPlay: (id: string, url: string) => void
}) {
  const playing = playingId === id
  const classes = ['reading__clip', modifier, playing && 'reading__clip--playing'].filter(Boolean)
  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={label}
      aria-pressed={playing}
      onClick={() => onPlay(id, clip.url)}
    >
      <span aria-hidden="true">{glyph}</span> {clip.key}
    </button>
  )
}
