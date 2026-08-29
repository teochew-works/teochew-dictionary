import { canCombine } from '@teochew/core'
import type { AudioReference, EnrichedReading, PronunciationMode } from '@teochew/core'
import type { AudioMode } from '../settings/audioMode'
import type { CombinedClipStatus } from '../hooks/useCombinedClip'

/**
 * Clip buttons for one reading: a combined "play all" button first when
 * offered, then the whole-word clip as ♪♪, then one ♪ button per syllable
 * that has a recording. Same glyphs as src/cli/lookup.ts, but that order is
 * reversed there (syllables, then the word clip last) — the CLI wasn't
 * updated when this ordering was chosen; see web/README.md.
 *
 * The word clip and syllables are offered together when both exist rather
 * than one suppressing the other — a word recording carries connected-speech
 * coarticulation a syllable clip can't (data/phonology/REVIEW.md § 16), but
 * the syllables stay reachable for drilling one at a time. `audioMode`
 * governs this independently of that: it toggles the *combined* control
 * (native wordAudio, or a synthesized clip — issue #191) against these
 * per-syllable "component" buttons, not one against the other.
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
  onPlayCombined,
  combinedStatus = 'idle',
  pronunciation = 'citation',
  audioMode = 'both',
}: {
  reading: EnrichedReading
  /** Disambiguates this reading's clip ids from every other reading's on the
   *  same entry, so two readings that happen to share a clip url don't share
   *  playing state. */
  readingIndex: number
  playingId: string | null
  onPlay: (id: string, url: string) => void
  /**
   * Plays the combined clip under `id` — reading.wordAudio directly when
   * present, otherwise a synthesized clip once `combinedStatus` is 'ready'.
   * Required whenever a combined button can be shown; the caller owns that
   * branch since it's the one holding both useAudioPlayer and
   * useCombinedClip.
   */
  onPlayCombined?: (id: string) => void
  /** Synthesis status for this reading's combined clip. Irrelevant (and ignored) when reading.wordAudio covers it — that path is always instant. */
  combinedStatus?: CombinedClipStatus
  /** Which per-syllable clip array to play from. Defaults to citation — only
   *  Flashcard mode's sandhi toggle passes 'sandhi'. */
  pronunciation?: PronunciationMode
  /** Component (per-syllable) buttons, the combined "play all" button, or both. Defaults to both. */
  audioMode?: AudioMode
}) {
  const syllableClips = pronunciation === 'sandhi' ? reading.sandhiAudio : reading.audio
  const hasSyllableClip = syllableClips.some((c) => c !== null)
  if (!reading.wordAudio && !hasSyllableClip) return null

  // A native wordAudio recording IS a combined clip already — no synthesis
  // needed, so it alone is enough to make this reading combinable.
  const combinable = reading.wordAudio !== null || canCombine(reading, pronunciation)
  // "combined" falls back to component buttons when this reading can't
  // combine, so an entry never loses audio access entirely just because the
  // setting says "combined only" — showCombined always implies combinable,
  // so there's no state that offers a button with nothing to play.
  const showComponent = audioMode === 'component' || audioMode === 'both' || (audioMode === 'combined' && !combinable)
  const showCombined = combinable && (audioMode === 'combined' || audioMode === 'both')

  return (
    <div className="reading__audio">
      {showCombined && onPlayCombined && (
        <CombinedClipButton
          id={`${readingIndex}:combined`}
          label={`Play combined recording of ${reading.pengim}`}
          status={reading.wordAudio ? 'ready' : combinedStatus}
          playingId={playingId}
          onPlay={onPlayCombined}
        />
      )}
      {showComponent && reading.wordAudio && (
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
      {showComponent &&
        syllableClips.map(
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

function CombinedClipButton({
  id,
  label,
  status,
  playingId,
  onPlay,
}: {
  id: string
  label: string
  status: CombinedClipStatus
  playingId: string | null
  onPlay: (id: string) => void
}) {
  const playing = playingId === id
  const loading = status === 'loading'
  const classes = ['reading__clip', 'reading__clip--combined', playing && 'reading__clip--playing'].filter(Boolean)
  return (
    <button
      type="button"
      className={classes.join(' ')}
      aria-label={label}
      aria-pressed={playing}
      aria-busy={loading}
      disabled={loading}
      onClick={() => onPlay(id)}
    >
      <span aria-hidden="true">▶</span> Play all
    </button>
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
