/**
 * Marks a clip that is a re-rendering of a recording, not the recording
 * itself (ADR-0027). Sits inside a clip's play button wherever one is
 * rendered, so a learner can never mistake the normalised tier for a native
 * take — on the Sounds tab in particular, where a button's text is otherwise
 * just the speaker id and `jky-n` would read as a second person.
 */
export const SYNTHESIS_BADGE_TEXT = 'rendered'
export const SYNTHESIS_ARIA_SUFFIX = ' (re-rendered from a recording, not the recording itself)'

export function SynthesisBadge() {
  return (
    <span className="synthesis-badge" title="Re-rendered from a recording of the same speaker for consistent pitch, length and level">
      {SYNTHESIS_BADGE_TEXT}
    </span>
  )
}
