import type { AudioReference, EnrichedReading } from '@teochew/core'
import type { PronunciationMode } from '@teochew/core'

/**
 * Clip buttons for one reading: the whole-word clip first as ♪♪, then one ♪
 * button per syllable that has a recording. Same glyphs as src/cli/lookup.ts,
 * but that order is reversed there (syllables, then the word clip last) — the
 * CLI wasn't updated when this ordering was chosen; see web/README.md.
 *
 * Both are offered when both exist rather than the word clip suppressing the
 * syllables — a word recording carries connected-speech coarticulation a
 * syllable clip can't (data/phonology/REVIEW.md § 16), but the syllables stay
 * reachable for drilling one at a time.
 *
 * Renders nothing when the reading has no clips at all — still most readings
 * today, since recorded coverage (data/phonology/audio/chaozhou.yaml) is
 * partial and Shantou/Chaoyang have none yet (issues #37, #106).
 */
export function ReadingAudio({
  reading,
  readingIndex,
  playingId,
  onPlay,
  pronunciation = 'citation',
}: {
  reading: EnrichedReading
  /** Disambiguates this reading's clip ids from every other reading's on the
   *  same entry, so two readings that happen to share a clip url don't share
   *  playing state. */
  readingIndex: number
  playingId: string | null
  onPlay: (id: string, url: string) => void
  /** Which per-syllable clip array to play from. Defaults to citation — only
   *  Flashcard mode's sandhi toggle passes 'sandhi'. */
  pronunciation?: PronunciationMode
}) {
  const syllableClips = pronunciation === 'sandhi' ? reading.sandhiAudio : reading.audio
  const hasSyllableClip = syllableClips.some((c) => c !== null)
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
      {syllableClips.map(
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
