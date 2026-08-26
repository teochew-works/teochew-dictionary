import { useState } from 'react'
import type { EnrichedEntry, EnrichedReading } from '../types/dict'
import type { Grade } from '../srs/types'
import type { PromptMode } from '../flashcards/promptMode'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { ReadingAudio } from './ReadingAudio'

function ReadingLine({ reading }: { reading: EnrichedReading }) {
  return (
    <div className="flashcard__reading">
      <span className="flashcard__pengim">{reading.pengim}</span>
      <span className="flashcard__ipa">{reading.ipa}</span>
      <span className="flashcard__poj">{reading.poj}</span>
    </div>
  )
}

export function Flashcard({
  entry,
  mode,
  onGrade,
}: {
  entry: EnrichedEntry
  mode: PromptMode
  onGrade: (grade: Grade) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const { playingId, play } = useAudioPlayer()
  const reading = entry.readings[0]
  const gloss = entry.senses[0]?.gloss_en.join(', ')
  const audio = reading && <ReadingAudio reading={reading} readingIndex={0} playingId={playingId} onPlay={play} />

  function grade(g: Grade) {
    setRevealed(false)
    onGrade(g)
  }

  return (
    <div className="flashcard">
      <div className="flashcard__front">
        {mode === 'chinese' && entry.headword}
        {mode === 'english' && gloss}
        {mode === 'pronunciation' && reading && <ReadingLine reading={reading} />}
        {mode === 'audio-only' && audio}
      </div>

      {revealed ? (
        <>
          <div className="flashcard__back">
            {mode !== 'chinese' && <div className="flashcard__headword">{entry.headword}</div>}
            {mode !== 'pronunciation' && reading && <ReadingLine reading={reading} />}
            {mode !== 'english' && gloss && <div className="flashcard__gloss">{gloss}</div>}
            {mode !== 'audio-only' && audio}
          </div>
          <div className="flashcard__grades">
            <button type="button" className="flashcard__grade flashcard__grade--again" onClick={() => grade('again')}>
              Again
            </button>
            <button type="button" className="flashcard__grade flashcard__grade--good" onClick={() => grade('good')}>
              Good
            </button>
            <button type="button" className="flashcard__grade flashcard__grade--easy" onClick={() => grade('easy')}>
              Easy
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="flashcard__reveal" onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}
    </div>
  )
}
