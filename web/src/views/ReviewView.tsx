import { useCallback, useEffect, useRef, useState } from 'react'
import './ReviewView.css'

/**
 * Dev-only blind A/B listening test for generated audio (issue #260).
 *
 * TTS.md §4a's verdict on the trained VITS voice rests entirely on UTMOS and
 * the σ-grading, and neither can hear whether a syllable sounds right — or
 * is even the right syllable. This is where a person supplies what they
 * can't. It exists only under `npm run dev`: the route backing it
 * (`/api/tts-review`) is registered by a Vite plugin that never runs during a
 * build, and ADR-0027 forbids publishing any of this audio.
 *
 * Blind on purpose, and the blinding is the server's (see
 * `tts-review-handlers.ts`): the two clips arrive as A and B in an order
 * derived from the syllable, the audio URLs say only which side they are,
 * and which was generated is revealed only once a verdict is in. Told which
 * clip is synthetic, a listener hears artifacts in it whether or not they're
 * there — so a sighted comparison would produce confident, worthless data.
 *
 * Keyboard-first because the hold-out is 149 syllables: A/B (or 1/2) play a
 * side, Space replays the last, D/F/G/H rate, ←/→ move.
 */

type Preference = 'a' | 'b' | 'neither'
type Quality = 'indistinguishable' | 'acceptable' | 'worse' | 'unusable'

interface Verdict {
  preferred: Preference
  quality: Quality
  note?: string
  preferredGenerated: boolean | null
  generatedSide: 'a' | 'b'
  at: string
}

interface Item {
  key: string
  aUrl: string
  bUrl: string
  verdict: Verdict | null
}

interface Summary {
  n: number
  preferredGenerated: number
  preferredOriginal: number
  noPreference: number
  quality: Record<Quality, number>
}

interface SetInfo {
  id: string
  count: number
  summary: Summary
}

const QUALITIES: { id: Quality; label: string; hint: string; key: string }[] = [
  { id: 'indistinguishable', label: 'Indistinguishable', hint: "couldn't tell them apart", key: 'd' },
  { id: 'acceptable', label: 'Acceptable', hint: 'clearly synthetic, still usable', key: 'f' },
  { id: 'worse', label: 'Noticeably worse', hint: 'usable only if nothing better existed', key: 'g' },
  { id: 'unusable', label: 'Unusable', hint: 'wrong, or too degraded to publish', key: 'h' },
]

export function ReviewView() {
  const [sets, setSets] = useState<SetInfo[] | null>(null)
  const [setId, setSetId] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [index, setIndex] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Verdict | null>(null)
  const [playing, setPlaying] = useState<'a' | 'b' | null>(null)
  const [note, setNote] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastSideRef = useRef<'a' | 'b'>('a')

  useEffect(() => {
    fetch('/api/tts-review')
      .then((r) => r.json())
      .then((body: { sets: SetInfo[] }) => {
        setSets(body.sets)
        if (body.sets.length > 0) setSetId((current) => current ?? body.sets[0]!.id)
      })
      .catch(() => setError('could not reach /api/tts-review — is `npm run dev` serving this?'))
  }, [])

  useEffect(() => {
    if (setId === null) return
    fetch(`/api/tts-review/set/${encodeURIComponent(setId)}`)
      .then((r) => r.json())
      .then((body: { items?: Item[]; summary?: Summary; error?: string }) => {
        if (body.error) {
          setError(body.error)
          return
        }
        setItems(body.items ?? [])
        setSummary(body.summary ?? null)
        // Resume where the listening got to, rather than at the top.
        const next = (body.items ?? []).findIndex((i) => i.verdict === null)
        setIndex(next === -1 ? 0 : next)
        setRevealed(null)
        setError(null)
      })
      .catch(() => setError('could not load that set'))
  }, [setId])

  const item = items[index] ?? null

  useEffect(() => {
    setRevealed(item?.verdict ?? null)
    setNote(item?.verdict?.note ?? '')
  }, [item])

  const play = useCallback(
    (side: 'a' | 'b') => {
      if (!item) return
      lastSideRef.current = side
      const el = audioRef.current ?? new Audio()
      audioRef.current = el
      el.pause()
      el.src = side === 'a' ? item.aUrl : item.bUrl
      el.onended = () => setPlaying(null)
      setPlaying(side)
      void el.play().catch(() => setPlaying(null))
    },
    [item],
  )

  const move = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(items.length - 1, Math.max(0, i + delta)))
    },
    [items.length],
  )

  const [preferred, setPreferred] = useState<Preference | null>(null)
  useEffect(() => setPreferred(item?.verdict?.preferred ?? null), [item])

  const submit = useCallback(
    (quality: Quality) => {
      if (!item || setId === null || preferred === null) return
      fetch('/api/tts-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setId, key: item.key, preferred, quality, note: note || undefined }),
      })
        .then((r) => r.json())
        .then((body: { ok: boolean; verdict?: Verdict; error?: string }) => {
          if (!body.ok || !body.verdict) {
            setError(body.error ?? 'could not save')
            return
          }
          const verdict = body.verdict
          setItems((prev) => prev.map((it, i) => (i === index ? { ...it, verdict } : it)))
          setRevealed(verdict)
          setSummary((s) =>
            s === null
              ? s
              : {
                  ...s,
                  n: s.n + (item.verdict ? 0 : 1),
                },
          )
        })
        .catch(() => setError('could not save'))
    },
    [index, item, note, preferred, setId],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      if (k === 'a' || k === '1') return play('a'), e.preventDefault()
      if (k === 'b' || k === '2') return play('b'), e.preventDefault()
      if (k === ' ') return play(lastSideRef.current), e.preventDefault()
      if (k === 'arrowleft') return move(-1), e.preventDefault()
      if (k === 'arrowright') return move(1), e.preventDefault()
      if (k === 'n') return setPreferred('neither'), e.preventDefault()
      const quality = QUALITIES.find((q) => q.key === k)
      if (quality) return submit(quality.id), e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, play, submit])

  if (error) return <div className="review review--message">{error}</div>
  if (sets === null) return <div className="review review--message">Loading…</div>
  if (sets.length === 0) {
    return (
      <div className="review review--message">
        <p>No generated audio to review.</p>
        <p>
          Run <code>npm run tts:export</code> at the repo root, then generate some with{' '}
          <code>uv run tts synth</code> in <code>tools/tts/</code> — anything under{' '}
          <code>.cache/audio-tts/&#123;eval,sweep,runs&#125;/</code> shows up here.
        </p>
      </div>
    )
  }

  const done = items.filter((i) => i.verdict !== null).length
  const decided = summary ? summary.preferredGenerated + summary.preferredOriginal : 0

  return (
    <div className="review">
      <header className="review__bar">
        <label>
          Set{' '}
          <select value={setId ?? ''} onChange={(e) => setSetId(e.target.value)}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} ({s.count})
              </option>
            ))}
          </select>
        </label>
        <span className="review__progress">
          {done}/{items.length} judged
        </span>
        {summary && decided > 0 && (
          <span className="review__score" title="Blind preference for the generated clip. Near 50% means it could not be told from the recording.">
            generated preferred {Math.round((100 * summary.preferredGenerated) / decided)}% of {decided}
          </span>
        )}
      </header>

      {item === null ? (
        <div className="review--message">Nothing in this set.</div>
      ) : (
        <>
          <div className="review__key">
            <button type="button" onClick={() => move(-1)} disabled={index === 0} aria-label="Previous syllable">
              ←
            </button>
            <h2>{item.key}</h2>
            <button type="button" onClick={() => move(1)} disabled={index === items.length - 1} aria-label="Next syllable">
              →
            </button>
          </div>

          <div className="review__pair">
            {(['a', 'b'] as const).map((side) => (
              <div key={side} className="review__side">
                <button
                  type="button"
                  className={`review__play ${playing === side ? 'is-playing' : ''}`}
                  onClick={() => play(side)}
                >
                  ▶ {side.toUpperCase()}
                </button>
                <button
                  type="button"
                  className={`review__prefer ${preferred === side ? 'is-chosen' : ''}`}
                  onClick={() => setPreferred(side)}
                >
                  Prefer {side.toUpperCase()}
                </button>
                {revealed && (
                  <span className={`review__reveal ${revealed.generatedSide === side ? 'is-generated' : 'is-original'}`}>
                    {revealed.generatedSide === side ? 'generated' : 'recording'}
                  </span>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            className={`review__neither ${preferred === 'neither' ? 'is-chosen' : ''}`}
            onClick={() => setPreferred('neither')}
          >
            No preference <kbd>N</kbd>
          </button>

          <div className="review__qualities">
            <p className="review__prompt">
              {preferred === null ? 'Pick a preference first, then rate the generated clip:' : 'Is the generated clip good enough?'}
            </p>
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                type="button"
                disabled={preferred === null}
                className={revealed?.quality === q.id ? 'is-chosen' : ''}
                onClick={() => submit(q.id)}
              >
                <kbd>{q.key.toUpperCase()}</kbd> {q.label} <small>{q.hint}</small>
              </button>
            ))}
          </div>

          <textarea
            className="review__note"
            placeholder="Optional note — e.g. wrong tone, missing aspiration"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <p className="review__help">
            <kbd>A</kbd>/<kbd>B</kbd> play · <kbd>Space</kbd> replay · <kbd>N</kbd> no preference · <kbd>D</kbd>
            <kbd>F</kbd>
            <kbd>G</kbd>
            <kbd>H</kbd> rate · <kbd>←</kbd>
            <kbd>→</kbd> move
          </p>
        </>
      )}
    </div>
  )
}
