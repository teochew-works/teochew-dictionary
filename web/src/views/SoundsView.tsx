import { useMemo, useState } from 'react'
import { useSounds } from '../hooks/useSounds'
import type { Sound } from '../types/sounds'
import './SoundsView.css'

interface LetterGroup {
  letter: string
  sounds: Sound[]
}

/**
 * Buckets consecutive sounds sharing a Peng'im initial letter. Relies on
 * `sounds` already being sorted alphabetically by Peng'im (guaranteed by
 * `src/build/sounds.ts`) rather than hard-coding the set of initials, so a
 * future change to the orthography's initials can't leave this stale.
 */
function groupByLetter(sounds: Sound[]): LetterGroup[] {
  const groups: LetterGroup[] = []
  for (const sound of sounds) {
    const letter = sound.pengim.charAt(0)
    const last = groups.at(-1)
    if (last && last.letter === letter) last.sounds.push(sound)
    else groups.push({ letter, sounds: [sound] })
  }
  return groups
}

function matchesQuery(sound: Sound, query: string): boolean {
  if (!query) return true
  const haystack = [sound.pengim, sound.ipa, ...sound.examples.flatMap((e) => [e.headword, e.pengim, e.gloss])]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function SoundsView() {
  const { data, loading, error } = useSounds()
  const [query, setQuery] = useState('')

  const allLetters = useMemo(() => groupByLetter(data?.sounds ?? []).map((g) => g.letter), [data])

  const groups = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return groupByLetter(data.sounds.filter((s) => matchesQuery(s, q)))
  }, [data, query])

  if (loading) return <p className="sounds-view__status">Loading sound inventory…</p>
  if (error) {
    return <p className="sounds-view__status sounds-view__status--error">Couldn't load the sound inventory ({error}).</p>
  }
  if (!data) return null

  const activeLetters = new Set(groups.map((g) => g.letter))
  const shownCount = groups.reduce((n, g) => n + g.sounds.length, 0)

  return (
    <div className="sounds-view">
      <div className="sounds-view__controls">
        <input
          type="search"
          className="sounds-view__search"
          placeholder="Search sound, Peng'im, hanzi, or gloss…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the sound inventory"
        />
        <span className="sounds-view__count">
          {shownCount} / {data.sounds.length} sounds
        </span>
      </div>

      <nav className="sounds-view__alphabet" aria-label="Jump to initial">
        {allLetters.map((letter) => {
          const active = activeLetters.has(letter)
          return (
            <a
              key={letter}
              href={`#sound-group-${letter}`}
              className={active ? 'sounds-view__letter' : 'sounds-view__letter sounds-view__letter--empty'}
              aria-disabled={!active}
              tabIndex={active ? 0 : -1}
            >
              {letter}
            </a>
          )
        })}
      </nav>

      <div className="sounds-view__list">
        {groups.length === 0 && <p className="sounds-view__empty">No sounds match "{query.trim()}".</p>}
        {groups.map(({ letter, sounds }) => (
          <section key={letter} id={`sound-group-${letter}`} className="sounds-view__group">
            <h2 className="sounds-view__group-heading">
              {letter}
              <span className="sounds-view__group-count">{sounds.length}</span>
            </h2>
            <ul className="sounds-view__rows">
              {sounds.map((sound) => (
                <li key={sound.pengim} className="sound-row">
                  <span className="sound-row__ipa">{sound.ipa}</span>
                  <span className="sound-row__pengim">{sound.pengim}</span>
                  <span className="sound-row__examples">
                    {sound.examples.length === 0 && (
                      <span className="sound-row__no-examples">no isolated example yet</span>
                    )}
                    {/* Index, not a text-derived key: two senses of the same
                        word (same headword + pengim, different gloss) can
                        both appear as examples for one sound, and this list
                        is never reordered or filtered independently. */}
                    {sound.examples.map((example, i) => (
                      <span key={i} className="sound-row__example">
                        <span className="sound-row__example-hanzi">{example.headword}</span>
                        <span className="sound-row__example-pengim">{example.pengim}</span>
                        <span className="sound-row__example-gloss">{example.gloss}</span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
