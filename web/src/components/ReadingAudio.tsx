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
  playingUrl,
  onPlay,
}: {
  reading: EnrichedReading
  playingUrl: string | null
  onPlay: (url: string) => void
}) {
  const syllableClips = reading.audio.filter((c): c is AudioReference => c !== null)
  if (!reading.wordAudio && syllableClips.length === 0) return null

  return (
    <div className="reading__audio">
      {reading.wordAudio && (
        <ClipButton
          clip={reading.wordAudio}
          glyph="♪♪"
          label={`Play whole-word recording of ${reading.wordAudio.key}`}
          modifier="reading__clip--word"
          playingUrl={playingUrl}
          onPlay={onPlay}
        />
      )}
      {syllableClips.map((clip, i) => (
        <ClipButton
          // Not keyed by url: a reduplicated reading (mang7 mang7) resolves
          // both syllables to the same clip.
          key={`${i}-${clip.url}`}
          clip={clip}
          glyph="♪"
          label={`Play recording of syllable ${clip.key}`}
          playingUrl={playingUrl}
          onPlay={onPlay}
        />
      ))}
    </div>
  )
}

function ClipButton({
  clip,
  glyph,
  label,
  modifier,
  playingUrl,
  onPlay,
}: {
  clip: AudioReference
  glyph: string
  label: string
  modifier?: string
  playingUrl: string | null
  onPlay: (url: string) => void
}) {
  const playing = playingUrl === clip.url
  const classes = ['reading__clip', modifier, playing && 'reading__clip--playing'].filter(Boolean)
  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={label}
      aria-pressed={playing}
      onClick={() => onPlay(clip.url)}
    >
      <span aria-hidden="true">{glyph}</span> {clip.key}
    </button>
  )
}
