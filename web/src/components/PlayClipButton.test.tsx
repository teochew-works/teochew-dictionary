import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PlayClipButton, clipLabel } from './PlayClipButton'
import { SYNTHESIS_BADGE_TEXT } from './SynthesisBadge'

describe('PlayClipButton', () => {
  afterEach(cleanup)

  it('labels a recording by its speaker with no badge', () => {
    render(<PlayClipButton id="a1:0" clip={{ url: 'https://x/a1', speaker: 'jky' }} label="jky" ariaLabel="Play recording by jky" playingId={null} onPlay={() => {}} />)
    expect(screen.getByRole('button', { name: 'Play recording by jky' })).toBeInTheDocument()
    expect(screen.queryByText(SYNTHESIS_BADGE_TEXT)).not.toBeInTheDocument()
  })

  it('badges a rendered clip and says so in the accessible name (ADR-0027)', () => {
    const clip = { url: 'https://x/a1n', speaker: 'jky-n', synthesis: 'world-retune' as const }
    render(<PlayClipButton id="a1:1" clip={clip} label={clipLabel(clip, 1, 2)} ariaLabel="Play recording by jky-n" playingId={null} onPlay={() => {}} />)
    const button = screen.getByRole('button', { name: /Play recording by jky-n \(re-rendered from a recording, not the recording itself\)/ })
    expect(button).toHaveTextContent('jky-n')
    expect(button).toHaveTextContent(SYNTHESIS_BADGE_TEXT)
  })
})
