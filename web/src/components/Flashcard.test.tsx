import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Flashcard } from './Flashcard'
import { makeEntry, makeReading } from '../test/entryFixtures'
import type { AudioReference } from '../types/dict'

const WORD_CLIP: AudioReference = {
  key: 'dio5 ziu1',
  url: 'https://example.com/dio5-ziu1.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: [],
}

const SYLLABLE_CLIP: AudioReference = {
  key: 'dio5',
  url: 'https://example.com/dio5.opus',
  confidence: 'high',
  licence: 'CC-BY-4.0',
  attributions: [],
}

const ENTRY = makeEntry()
const ENTRY_WITH_AUDIO = makeEntry({ readings: [makeReading({ wordAudio: WORD_CLIP })] })

function reveal() {
  fireEvent.click(screen.getByText('Show answer'))
}

describe('Flashcard prompt modes', () => {
  afterEach(cleanup)

  it('chinese mode: prompts with the headword, answer reveals reading + gloss without repeating the headword', () => {
    render(<Flashcard entry={ENTRY} mode="chinese" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.getByText('潮州')).toBeInTheDocument()
    expect(screen.queryByText('dio5 ziu1')).not.toBeInTheDocument()
    expect(screen.queryByText('Chaozhou, Teochew')).not.toBeInTheDocument()

    reveal()
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()
    expect(screen.getAllByText('潮州')).toHaveLength(1)
  })

  it('english mode: prompts with the gloss, answer reveals headword + reading without repeating the gloss', () => {
    render(<Flashcard entry={ENTRY} mode="english" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()
    expect(screen.queryByText('潮州')).not.toBeInTheDocument()

    reveal()
    expect(screen.getByText('潮州')).toBeInTheDocument()
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()
    expect(screen.getAllByText('Chaozhou, Teochew')).toHaveLength(1)
  })

  it('pronunciation mode: prompts with the reading, answer reveals headword + gloss without repeating the reading', () => {
    render(<Flashcard entry={ENTRY} mode="pronunciation" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()
    expect(screen.queryByText('潮州')).not.toBeInTheDocument()

    reveal()
    expect(screen.getByText('潮州')).toBeInTheDocument()
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()
    expect(screen.getAllByText('dio5 ziu1')).toHaveLength(1)
  })
})

describe('Flashcard audio-only mode', () => {
  let play: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('prompts with only a play button, revealing headword + reading + gloss without a second play button', () => {
    render(<Flashcard entry={ENTRY_WITH_AUDIO} mode="audio-only" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.queryByText('潮州')).not.toBeInTheDocument()
    expect(screen.queryByText('Chaozhou, Teochew')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Play /})).toHaveLength(1)

    reveal()
    expect(screen.getByText('潮州')).toBeInTheDocument()
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()
    // The reading text ("dio5 ziu1") also appears as the play button's own
    // label, so only assert the button count stays at one rather than
    // asserting on that text, which is ambiguous between the two.
    expect(screen.getAllByRole('button', { name: /^Play /})).toHaveLength(1)
  })

  it('renders no play button at all when the reading has no clip', () => {
    render(<Flashcard entry={ENTRY} mode="chinese" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.queryAllByRole('button', { name: /^Play /})).toHaveLength(0)
  })

  it('plays the clip via useAudioPlayer when the play button is clicked', () => {
    render(<Flashcard entry={ENTRY_WITH_AUDIO} mode="audio-only" pronunciation="citation" onGrade={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Play /}))
    expect(play).toHaveBeenCalledTimes(1)
  })
})

describe('Flashcard pronunciation toggle', () => {
  afterEach(cleanup)

  it('citation mode shows the citation pengim', () => {
    render(<Flashcard entry={ENTRY} mode="pronunciation" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.getByText('dio5 ziu1')).toBeInTheDocument()
    expect(screen.queryByText('dio7 ziu1')).not.toBeInTheDocument()
  })

  it('sandhi mode shows the sandhi respelling instead of the citation pengim', () => {
    render(<Flashcard entry={ENTRY} mode="pronunciation" pronunciation="sandhi" onGrade={() => {}} />)
    expect(screen.getByText('dio7 ziu1')).toBeInTheDocument()
    expect(screen.queryByText('dio5 ziu1')).not.toBeInTheDocument()
  })

  it('citation mode ignores a clip that only exists on the sandhi array', () => {
    const entry = makeEntry({ readings: [makeReading({ audio: [null, null], sandhiAudio: [SYLLABLE_CLIP, null] })] })
    render(<Flashcard entry={entry} mode="audio-only" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Play /})).not.toBeInTheDocument()
  })

  it('sandhi mode plays a sandhi-specific clip not present in the citation array', () => {
    const entry = makeEntry({ readings: [makeReading({ audio: [null, null], sandhiAudio: [SYLLABLE_CLIP, null] })] })
    render(<Flashcard entry={entry} mode="audio-only" pronunciation="sandhi" onGrade={() => {}} />)
    expect(screen.getByRole('button', { name: /^Play /})).toBeInTheDocument()
  })

  it('sandhi mode still plays the citation clip once the build step has already applied the fallback', () => {
    const entry = makeEntry({ readings: [makeReading({ audio: [SYLLABLE_CLIP, null], sandhiAudio: [SYLLABLE_CLIP, null] })] })
    render(<Flashcard entry={entry} mode="audio-only" pronunciation="sandhi" onGrade={() => {}} />)
    expect(screen.getByRole('button', { name: /^Play /})).toBeInTheDocument()
  })
})

describe('Flashcard remount on card change', () => {
  afterEach(cleanup)

  it('does not leak the answer of the previous card when the displayed entry changes', () => {
    const entryB = makeEntry({ id: 'other', headword: '別', senses: [{ pos: 'noun', gloss_en: ['other'] }] })

    const { rerender } = render(<Flashcard key={ENTRY.id} entry={ENTRY} mode="chinese" pronunciation="citation" onGrade={() => {}} />)
    reveal()
    expect(screen.getByText('Chaozhou, Teochew')).toBeInTheDocument()

    rerender(<Flashcard key={entryB.id} entry={entryB} mode="chinese" pronunciation="citation" onGrade={() => {}} />)
    expect(screen.getByText('別')).toBeInTheDocument()
    expect(screen.queryByText('other')).not.toBeInTheDocument()
    expect(screen.getByText('Show answer')).toBeInTheDocument()
  })
})
