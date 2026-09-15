import { useEffect, useMemo, useState } from 'react'
import { useSounds } from '../hooks/useSounds'
import { useLocalRecordingsStatus, type PublishedClip } from '../hooks/useLocalRecordingsStatus'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { PlayClipButton, clipLabel } from '../components/PlayClipButton'
import { AUDIO_CONSENT_URL } from '../audioConsent'
import { bytesToBase64, todayIsoDate } from '../lib/audioEncoding'
import type { Sound } from '../types/sounds'
import './ElicitationView.css'

/**
 * A second, genuinely independent recording session for jky (issue #288):
 * every accuracy number reported by the classifier work in #279/#280/#285
 * used `jky-n` — a WORLD-vocoder resynthesis of jky's own clips — as its
 * "held-out" query set, but a resynthesis preserves the source clip's
 * spectral envelope (ADR-0027), so it isn't independent data. This view
 * walks a contributor through re-recording jky's existing inventory a
 * second time, one syllable at a time, staged through the same dev-only
 * `/api/local-recordings` flow `RecordClipButton` uses (ADR-0017) — never
 * published directly from here.
 *
 * Deliberately does not depend on the axis-classifier work in progress on
 * PR #281 (`computeAxisCandidates`, DTW/MFCC): "acoustically adjacent" here
 * just means "shares this axis value" — same initial, same rime, or same
 * tone as the syllable being recorded — read straight from `sounds.json`,
 * which every build already carries. A future pass can bias these toward
 * genuine worst-confusion pairs once that work lands; this ships the
 * elicitation flow independently of it.
 */

type Axis = 'initial' | 'rime' | 'tone'

const AXES: { axis: Axis; label: string; description: string }[] = [
  { axis: 'initial', label: 'Same initial', description: 'another syllable starting the same way' },
  { axis: 'rime', label: 'Same rime', description: 'another syllable ending the same way' },
  { axis: 'tone', label: 'Same tone', description: 'another syllable on the same tone' },
]

function axisValue(sound: Sound, axis: Axis): string | number | null {
  return sound[axis]
}

function mergedClips(sound: Sound, published: Map<string, PublishedClip[]> | undefined): PublishedClip[] {
  return published?.get(sound.pengim) ?? sound.clips
}

function realClips(sound: Sound, published: Map<string, PublishedClip[]> | undefined): PublishedClip[] {
  return mergedClips(sound, published).filter((c) => !c.synthesis)
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]!
}

export function ElicitationView() {
  const { data, loading, error } = useSounds()
  const localRecordings = useLocalRecordingsStatus()
  const { playingId, play } = useAudioPlayer()
  const recorder = useAudioRecorder()

  const [consentAcknowledged, setConsentAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState<Set<string>>(() => new Set())
  const [currentPengim, setCurrentPengim] = useState<string | null>(null)

  const published = localRecordings?.published
  const pending = localRecordings?.pending ?? new Set<string>()

  const bySound = useMemo(() => new Map((data?.sounds ?? []).map((s) => [s.pengim, s])), [data])

  // Needs a second session: exactly one real (non-synthesis) clip today —
  // zero means no first session yet (not this UI's job), two or more means
  // a second session already exists. Also skip anything already staged
  // (`pending`) or just recorded in this browser tab.
  const queue = useMemo(() => {
    if (!data) return []
    return data.sounds.filter((s) => {
      if (pending.has(s.pengim) || justSaved.has(s.pengim)) return false
      return realClips(s, published).length === 1
    })
  }, [data, published, pending, justSaved])

  // Keep `currentPengim` pointed at something still in the queue, picking a
  // fresh random one whenever it falls out (queue changes, or nothing chosen yet).
  useEffect(() => {
    if (currentPengim && queue.some((s) => s.pengim === currentPengim)) return
    setCurrentPengim(pickRandom(queue)?.pengim ?? null)
  }, [queue, currentPengim])

  const current = currentPengim ? (bySound.get(currentPengim) ?? null) : null

  const references = useMemo(() => {
    const result: Partial<Record<Axis, Sound>> = {}
    if (!current || !data) return result
    for (const { axis } of AXES) {
      const candidates = data.sounds.filter(
        (s) => s.pengim !== current.pengim && axisValue(s, axis) === axisValue(current, axis) && realClips(s, published).length > 0,
      )
      const pick = pickRandom(candidates)
      if (pick) result[axis] = pick
    }
    return result
  }, [current, data, published])

  const skip = () => {
    recorder.reset()
    setConsentAcknowledged(false)
    setSaveError(null)
    const next = pickRandom(queue.filter((s) => s.pengim !== currentPengim))
    setCurrentPengim(next?.pengim ?? currentPengim)
  }

  const canSave = recorder.phase === 'recorded' && consentAcknowledged && !saving

  const save = async () => {
    const blob = recorder.getBlob()
    if (!canSave || !blob || !current) return
    setSaving(true)
    setSaveError(null)
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const res = await fetch('/api/local-recordings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pengim: current.pengim,
          recordedDate: todayIsoDate(),
          consentAcknowledged: true,
          audioBase64: bytesToBase64(bytes),
          mimeType: blob.type || 'audio/webm',
        }),
      })
      const result = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !result.ok) throw new Error(result.error ?? `save failed (HTTP ${res.status})`)

      setJustSaved((prev) => new Set(prev).add(current.pengim))
      recorder.reset()
      setConsentAcknowledged(false)
      setCurrentPengim(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="elicitation-view__status">Loading sound inventory…</p>
  if (error) {
    return <p className="elicitation-view__status elicitation-view__status--error">Couldn't load the sound inventory ({error}).</p>
  }
  if (!data) return null

  const disableInputs = recorder.phase === 'recording' || saving

  return (
    <div className="elicitation-view">
      <p className="elicitation-view__intro">
        Record a second, independent take of jky's existing syllable inventory (issue #288) — the reference clips below
        are other syllables sharing an axis with the one you're about to record, so you can hear how that axis normally
        sounds right before you speak. Speaker id is assigned later, at merge time.
      </p>
      <p className="elicitation-view__progress">{queue.length} syllable{queue.length === 1 ? '' : 's'} still need a second session</p>

      {!current && <p className="elicitation-view__status">Nothing left to record right now.</p>}

      {current && (
        <div className="elicitation-view__card">
          <div className="elicitation-view__target">
            <span className="elicitation-view__target-pengim">{current.pengim}</span>
            <span className="elicitation-view__target-ipa">{current.ipa}</span>
          </div>

          <div className="elicitation-view__references">
            {AXES.map(({ axis, label, description }) => {
              const ref = references[axis]
              return (
                <div key={axis} className="elicitation-view__reference">
                  <span className="elicitation-view__reference-label" title={description}>
                    {label}
                  </span>
                  {ref ? (
                    (() => {
                      const clips = realClips(ref, published)
                      const clip = clips[0]!
                      return (
                        <span className="elicitation-view__reference-clip">
                          <span className="elicitation-view__reference-pengim">{ref.pengim}</span>
                          <PlayClipButton
                            id={`elicit-ref-${axis}:${ref.pengim}`}
                            clip={clip}
                            label={clipLabel(clip, 0, clips.length)}
                            ariaLabel={`Play reference recording ${ref.pengim}`}
                            playingId={playingId}
                            onPlay={play}
                          />
                        </span>
                      )
                    })()
                  ) : (
                    <span className="elicitation-view__reference-none">no reference available</span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="elicitation-view__recorder">
            <label className="elicitation-view__consent">
              <input
                type="checkbox"
                checked={consentAcknowledged}
                onChange={(e) => setConsentAcknowledged(e.target.checked)}
                disabled={disableInputs}
              />
              I have read{' '}
              <a href={AUDIO_CONSENT_URL} target="_blank" rel="noreferrer">
                AUDIO-CONSENT.md
              </a>{' '}
              and obtained the speaker's explicit consent.
            </label>

            {recorder.phase === 'idle' && (
              <button type="button" onClick={recorder.start}>
                ● Start recording
              </button>
            )}

            {recorder.phase === 'recording' && (
              <button type="button" onClick={recorder.stop}>
                ■ Stop
              </button>
            )}

            {recorder.previewUrl && recorder.phase === 'recorded' && (
              <span className="elicitation-view__preview">
                <audio controls src={recorder.previewUrl} />
                <button type="button" onClick={recorder.reset}>
                  Re-record
                </button>
                <button type="button" onClick={save} disabled={!canSave}>
                  {saving ? 'Saving…' : 'Save to staging'}
                </button>
              </span>
            )}

            <button type="button" className="elicitation-view__skip" onClick={skip}>
              Skip
            </button>

            {(recorder.error ?? saveError) && (
              <span className="elicitation-view__error" role="alert">
                {recorder.error ?? saveError}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
