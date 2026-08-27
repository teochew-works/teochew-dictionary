import type { PublishedClip } from '../hooks/useLocalRecordingsStatus'

/**
 * Falls back to a numbered label ("Recording 2") rather than the plain "Play"
 * used when a sound has just one unlabeled clip — with several clips at the
 * same syllable (issue #134), an unnumbered fallback would leave two buttons
 * with identical text and no way to tell them apart.
 */
export function clipLabel(clip: PublishedClip, index: number, total: number): string {
  if (clip.speaker) return clip.speaker
  return total > 1 ? `Recording ${index + 1}` : 'Play'
}

/**
 * One clip's play button (issue #132, extended for multiple clips per
 * syllable by issue #134). Standalone rather than a private function local to
 * one view: originally single-caller (SoundRow, in SoundsView.tsx), it picked
 * up a second caller when the Sounds tab's Chart view (issue #171) needed the
 * same control in its cell-detail panel. Reuses useAudioPlayer, the same
 * shared-<audio> primitive the Dictionary tab already plays clips with.
 *
 * `id` is `${pengim}:${index}`, not the bare pengim: two clips at the same
 * syllable need distinct playback ids so starting one doesn't read as
 * already-playing for the other.
 */
export function PlayClipButton({
  id,
  clip,
  label,
  ariaLabel,
  playingId,
  onPlay,
}: {
  id: string
  clip: PublishedClip
  label: string
  ariaLabel: string
  playingId: string | null
  onPlay: (id: string, url: string) => void
}) {
  const playing = playingId === id
  return (
    <button
      type="button"
      className={playing ? 'sound-row__play sound-row__play--playing' : 'sound-row__play'}
      aria-label={ariaLabel}
      aria-pressed={playing}
      onClick={() => onPlay(id, clip.url)}
    >
      <span aria-hidden="true">▶</span> {label}
    </button>
  )
}
