import { useEffect, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { EnrichedEntry, EnrichedReading } from '../types/dict'
import type { Grade } from '../srs/types'
import type { PromptMode } from '../flashcards/promptMode'
import type { PronunciationMode } from '../settings/pronunciationMode'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { ReadingAudio } from './ReadingAudio'
import type { Deck } from '../decks/types'

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 'again', label: 'Again', key: '1' },
  { grade: 'good', label: 'Good', key: '2' },
  { grade: 'easy', label: 'Easy', key: '3' },
]

function ReadingLine({ reading, pronunciation }: { reading: EnrichedReading; pronunciation: PronunciationMode }) {
  return (
    <div className="card__reading">
      <span className="card__pengim mono">{pronunciation === 'sandhi' ? reading.sandhi : reading.pengim}</span>
      <span className="card__ipa mono">{reading.ipa}</span>
      <span className="card__poj mono">{reading.poj}</span>
    </div>
  )
}

/**
 * The card under review. Beyond the prompt and the answer it carries two
 * things the plain card didn't: which deck on the table it was drawn from
 * (the hue dot and name in the corner), and a handle for dragging it into
 * one of your decks — filing a card you just met is the moment you most
 * want to, and walking to a separate control loses that.
 *
 * Space reveals and 1/2/3 grade, so a review session needs no pointer at
 * all; the shortcuts stand down whenever focus is in a text field.
 */
export function Flashcard({
  entry,
  mode,
  pronunciation,
  sourceDeck,
  intervals,
  filingDrag,
  onGrade,
}: {
  entry: EnrichedEntry
  mode: PromptMode
  pronunciation: PronunciationMode
  /** The in-play deck this card came from, or null when it came from the dictionary. */
  sourceDeck: Deck | null
  /** Days each grade would schedule, from the live card state — see srs/scheduler.ts's previewIntervals. */
  intervals: Record<Grade, number>
  onGrade: (grade: Grade) => void
  filingDrag: { onPointerDown: (e: ReactPointerEvent) => void; dragging: boolean } | null
}) {
  const [revealed, setRevealed] = useState(false)
  const { playingId, play } = useAudioPlayer()
  const reading = entry.readings[0]
  const gloss = entry.senses[0]?.gloss_en.join(', ')
  const audio = reading && (
    <ReadingAudio reading={reading} readingIndex={0} playingId={playingId} onPlay={play} pronunciation={pronunciation} />
  )

  function grade(g: Grade) {
    setRevealed(false)
    onGrade(g)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // The target is `document` when nothing is focused, so this can't
      // assume an Element — and the shortcuts stand down whenever focus is
      // somewhere that already means something by these keys.
      const target = e.target
      if (target instanceof Element && target.closest('input, textarea, [role="button"], [role="menu"]')) return
      if (!revealed && e.key === ' ') {
        e.preventDefault()
        setRevealed(true)
        return
      }
      if (!revealed) return
      const match = GRADES.find((g) => g.key === e.key)
      if (match) grade(match.grade)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  const hue = sourceDeck ? `var(--deck-hue-${sourceDeck.hue}-bg)` : 'var(--color-muted)'

  return (
    <div className="card" style={{ ['--hue' as string]: hue }}>
      <div className="card__source">
        <i aria-hidden="true" />
        <span>{sourceDeck?.name ?? 'Dictionary'}</span>
      </div>

      {filingDrag && (
        <button
          type="button"
          className={filingDrag.dragging ? 'card__filing card__filing--dragging' : 'card__filing'}
          data-drag-source=""
          aria-label={`Drag ${entry.headword} onto one of your decks`}
          title="Drag onto a deck to file this card"
          onPointerDown={filingDrag.onPointerDown}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1.8 4.2A1.4 1.4 0 0 1 3.2 2.8h2.6l1.1 1.4h3.9a1.4 1.4 0 0 1 1.4 1.4v4.6a1.4 1.4 0 0 1-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4V4.2Z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path d="M7 6.6v3.2M5.4 8.2h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <div className={mode === 'english' ? 'card__prompt card__prompt--en' : 'card__prompt'}>
        {mode === 'chinese' && entry.headword}
        {mode === 'english' && gloss}
        {mode === 'pronunciation' && reading && <ReadingLine reading={reading} pronunciation={pronunciation} />}
        {mode === 'audio-only' && audio}
      </div>

      {revealed ? (
        <>
          <div className="card__back">
            {mode !== 'chinese' && <div className="card__hw">{entry.headword}</div>}
            {mode !== 'pronunciation' && reading && <ReadingLine reading={reading} pronunciation={pronunciation} />}
            {mode !== 'english' && gloss && <div className="card__gloss">{gloss}</div>}
            {mode !== 'audio-only' && audio}
          </div>
          <div className="grades">
            {GRADES.map(({ grade: g, label, key }) => (
              <button key={g} type="button" className={`grade grade--${g}`} onClick={() => grade(g)}>
                {label}
                <small>
                  {intervals[g]}d · {key}
                </small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" className="card__reveal" onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}
    </div>
  )
}
