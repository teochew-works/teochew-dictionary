import { useState } from 'react'
import type { EnrichedEntry } from '../types/dict'
import type { Grade } from '../srs/types'

export function Flashcard({ entry, onGrade }: { entry: EnrichedEntry; onGrade: (grade: Grade) => void }) {
  const [revealed, setRevealed] = useState(false)
  const reading = entry.readings[0]
  const gloss = entry.senses[0]?.gloss_en.join(', ')

  function grade(g: Grade) {
    setRevealed(false)
    onGrade(g)
  }

  return (
    <div className="flashcard">
      <div className="flashcard__front">{entry.headword}</div>

      {revealed ? (
        <>
          <div className="flashcard__back">
            {reading && (
              <div className="flashcard__reading">
                <span className="flashcard__pengim">{reading.pengim}</span>
                <span className="flashcard__ipa">{reading.ipa}</span>
                <span className="flashcard__poj">{reading.poj}</span>
              </div>
            )}
            {gloss && <div className="flashcard__gloss">{gloss}</div>}
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
