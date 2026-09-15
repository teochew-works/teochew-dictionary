import { useEffect, useMemo, useState } from 'react'
import { useSounds } from '../hooks/useSounds'
import { useLocalRecordingsStatus, type PublishedClip, type StagedClip } from '../hooks/useLocalRecordingsStatus'
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
 *
 * A syllable stays in the pool until it has a second *published* real
 * clip — staging one or more takes doesn't remove it, so a contributor can
 * record several takes of the same target before a human picks which to
 * merge, and "Re-pick" (unlike a "Skip" that implied the target was done
 * with) just moves on to a different random target without excluding this
 * one from being picked again later.
 *
 * Picking isn't uniform: `pickingWeight` favors a target with fewer staged
 * takes so far, and separately favors one whose initial/rime/tone is shared
 * by few other recorded syllables (a rare axis component has little else to
 * fall back on, so an independent take of it is worth more).
 */

const CONSENT_STORAGE_KEY = 'teochew-dictionary:elicitation-consent-acknowledged'

function readStoredConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function storeConsent(value: boolean): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, String(value))
  } catch {
    // localStorage unavailable — inconvenient, not fatal.
  }
}

type Axis = 'initial' | 'rime' | 'tone'

const AXES: { axis: Axis; label: string; description: string }[] = [
  { axis: 'initial', label: 'Same initial', description: 'another syllable starting the same way' },
  { axis: 'rime', label: 'Same rime', description: 'another syllable ending the same way' },
  { axis: 'tone', label: 'Same tone', description: 'another syllable on the same tone' },
]

/** Up to this many random reference samples per axis, when that many candidates exist. */
const MAX_REFERENCES_PER_AXIS = 3

function axisValue(sound: Sound, axis: Axis): string | number | null {
  return sound[axis]
}

function mergedClips(sound: Sound, published: Map<string, PublishedClip[]> | undefined): PublishedClip[] {
  return published?.get(sound.pengim) ?? sound.clips
}

function realClips(sound: Sound, published: Map<string, PublishedClip[]> | undefined): PublishedClip[] {
  return mergedClips(sound, published).filter((c) => !c.synthesis)
}

/** A common headword character using this syllable, for visual context alongside the audio — the same examples the Sounds tab shows. */
function commonCharacter(sound: Sound): string | null {
  return sound.examples[0]?.headword ?? null
}

/** A staged (not yet merged) clip's own bytes have no published url — served back by the dev-only file route instead. */
function stagedFileUrl(localPath: string): string {
  return `/api/local-recordings/file?localPath=${encodeURIComponent(localPath)}`
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]!
}

/** Samples up to `n` distinct items at random, without replacement. */
function pickRandomSample<T>(items: T[], n: number): T[] {
  const pool = [...items]
  const picks: T[] = []
  while (pool.length > 0 && picks.length < n) {
    const index = Math.floor(Math.random() * pool.length)
    picks.push(pool.splice(index, 1)[0]!)
  }
  return picks
}

/** Weighted random pick, favoring lower weights less — falls back to a uniform pick if every weight is zero. */
function pickWeightedRandom<T>(items: T[], weightOf: (item: T) => number): T | null {
  if (items.length === 0) return null
  const weights = items.map((item) => Math.max(weightOf(item), 0))
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return pickRandom(items)
  let roll = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return items[i]!
  }
  return items[items.length - 1]!
}

/** Favors a target with fewer staged (not yet merged) takes so far, so recording effort spreads across the pool rather than piling onto a few targets. */
function stagedWeight(pengim: string, staged: Map<string, StagedClip[]> | undefined): number {
  const count = staged?.get(pengim)?.length ?? 0
  return 1 / (count + 1)
}

/** How many other *recorded* syllables share each axis value, for `axisRarityWeight` below. */
type AxisCounts = Record<Axis, Map<string | number | null, number>>

function buildAxisCounts(sounds: Sound[], published: Map<string, PublishedClip[]> | undefined): AxisCounts {
  const counts: AxisCounts = { initial: new Map(), rime: new Map(), tone: new Map() }
  for (const s of sounds) {
    if (realClips(s, published).length === 0) continue
    for (const { axis } of AXES) {
      const v = axisValue(s, axis)
      counts[axis].set(v, (counts[axis].get(v) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Favors a target whose initial, rime, or tone is shared by few other
 * recorded syllables — a rare axis component has few (if any) reference
 * samples available elsewhere, so an independent second-session take of it
 * is worth more than one more take of an axis component the corpus already
 * has plenty of. Each axis contributes independently (a syllable rare on
 * several axes at once is favored more, not just as much as being rare on one).
 */
function axisRarityWeight(sound: Sound, axisCounts: AxisCounts): number {
  let weight = 1
  for (const { axis } of AXES) {
    const count = axisCounts[axis].get(axisValue(sound, axis)) ?? 1
    weight *= 1 / count
  }
  return weight
}

/** Published + staged, so a bucket actually moves as takes are recorded — the pool itself only advances on a merge, but this reflects effort in progress too. */
function totalTakeCount(sound: Sound, published: Map<string, PublishedClip[]> | undefined, staged: Map<string, StagedClip[]> | undefined): number {
  return realClips(sound, published).length + (staged?.get(sound.pengim)?.length ?? 0)
}

/** The last bucket is "this many or more". */
const MAX_HISTOGRAM_BUCKET = 5

export function ElicitationView() {
  const { data, loading, error } = useSounds()
  const localRecordings = useLocalRecordingsStatus()
  const { playingId, play } = useAudioPlayer()
  const recorder = useAudioRecorder()

  const [consentAcknowledged, setConsentAcknowledged] = useState(readStoredConsent)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentPengim, setCurrentPengim] = useState<string | null>(null)

  const setConsent = (value: boolean) => {
    setConsentAcknowledged(value)
    storeConsent(value)
  }

  const published = localRecordings?.published
  const staged = localRecordings?.staged

  const bySound = useMemo(() => new Map((data?.sounds ?? []).map((s) => [s.pengim, s])), [data])

  // Needs a second session: exactly one real (non-synthesis), *published*
  // clip today — zero means no first session yet (not this UI's job), two
  // or more means a second session is already merged. A staged-but-unmerged
  // take doesn't count either way, so a target stays pickable for further
  // takes until a human actually merges one.
  const queue = useMemo(() => {
    if (!data) return []
    return data.sounds.filter((s) => realClips(s, published).length === 1)
  }, [data, published])

  const axisCounts = useMemo(() => buildAxisCounts(data?.sounds ?? [], published), [data, published])

  // Combines both picking biases: fewer staged takes so far, and a rarer
  // initial/rime/tone (few other recorded syllables share it, so there's
  // little else to fall back on for that component).
  const pickingWeight = (s: Sound) => stagedWeight(s.pengim, staged) * axisRarityWeight(s, axisCounts)

  // Keep `currentPengim` pointed at something still in the queue, picking a
  // fresh one — weighted as above — whenever it falls out (queue changes, or
  // nothing chosen yet).
  useEffect(() => {
    if (currentPengim && queue.some((s) => s.pengim === currentPengim)) return
    setCurrentPengim(pickWeightedRandom(queue, pickingWeight)?.pengim ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, currentPengim, staged, axisCounts])

  const current = currentPengim ? (bySound.get(currentPengim) ?? null) : null

  const sameSoundClip = current ? realClips(current, published)[0] : undefined

  // Picked once per target — deliberately keyed on `currentPengim` alone, not
  // on `current`/`data`/`published` object identity, so a re-render that
  // doesn't actually change the target (a clip starting to play, or
  // `published`/`staged` getting a new Map instance from `refresh()` after a
  // save) reuses the previous pick instead of reshuffling it. Still
  // synchronous — computed in the same render `current` first reflects the
  // new target in, not a tick later — since a `useMemo` with an
  // intentionally-narrow dep array still runs during render, unlike a
  // `useEffect` (which would leave one render with stale/empty references).
  const references = useMemo(() => {
    const result: Partial<Record<Axis, Sound[]>> = {}
    if (!current || !data) return result
    for (const { axis } of AXES) {
      const candidates = data.sounds.filter(
        (s) => s.pengim !== current.pengim && axisValue(s, axis) === axisValue(current, axis) && realClips(s, published).length > 0,
      )
      const picks = pickRandomSample(candidates, MAX_REFERENCES_PER_AXIS)
      if (picks.length > 0) result[axis] = picks
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPengim])

  // How recording effort is actually distributed right now — published and
  // staged takes both count, so this moves with every save, unlike the pool
  // itself (which only shrinks once a human merges a second take).
  const recordingCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const s of data?.sounds ?? []) {
      const bucket = Math.min(totalTakeCount(s, published, staged), MAX_HISTOGRAM_BUCKET)
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    }
    return counts
  }, [data, published, staged])

  const stagedTakes: StagedClip[] = (current && localRecordings?.staged.get(current.pengim)) || []

  const rePick = () => {
    recorder.reset()
    setSaveError(null)
    const candidates = queue.filter((s) => s.pengim !== currentPengim)
    const next = pickWeightedRandom(candidates, pickingWeight)
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

      localRecordings?.refresh()
      // Stay on the same target — recording another take of it is welcome.
      // Move on with "Re-pick" when you're done with this one.
      recorder.reset()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  const deleteStagedTake = async (localPath: string) => {
    setDeletingPath(localPath)
    setDeleteError(null)
    try {
      const res = await fetch('/api/local-recordings', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localPath }),
      })
      const result = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !result.ok) throw new Error(result.error ?? `delete failed (HTTP ${res.status})`)
      localRecordings?.refresh()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setDeletingPath(null)
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
      <ul className="elicitation-view__histogram" aria-label="Syllables by number of recordings">
        {Array.from({ length: MAX_HISTOGRAM_BUCKET + 1 }, (_, n) => n).map((n) => (
          <li key={n} className="elicitation-view__histogram-bucket">
            <span className="elicitation-view__histogram-count">{recordingCounts.get(n) ?? 0}</span>
            <span className="elicitation-view__histogram-label">
              {n === MAX_HISTOGRAM_BUCKET ? `${n}+` : n} recording{n === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>

      {!current && <p className="elicitation-view__status">Nothing left to record right now.</p>}

      {current && (
        <div className="elicitation-view__card">
          <div className="elicitation-view__target">
            <span className="elicitation-view__target-pengim">{current.pengim}</span>
            <span className="elicitation-view__target-ipa">{current.ipa}</span>
          </div>

          <div className="elicitation-view__references">
            {sameSoundClip && (
              <div className="elicitation-view__reference">
                <span className="elicitation-view__reference-label" title="your own existing recording of this exact syllable">
                  Same sound
                </span>
                <span className="elicitation-view__reference-clip">
                  <PlayClipButton
                    id={`elicit-ref-self:${current.pengim}`}
                    clip={sameSoundClip}
                    label={clipLabel(sameSoundClip, 0, 1)}
                    ariaLabel={`Play your existing recording of ${current.pengim}`}
                    playingId={playingId}
                    onPlay={play}
                  />
                </span>
              </div>
            )}

            {AXES.map(({ axis, label, description }) => {
              const refs = references[axis] ?? []
              return (
                <div key={axis} className="elicitation-view__reference">
                  <span className="elicitation-view__reference-label" title={description}>
                    {label}
                  </span>
                  {refs.length > 0 ? (
                    <span className="elicitation-view__reference-samples">
                      {refs.map((ref) => {
                        const clips = realClips(ref, published)
                        const clip = clips[0]!
                        const character = commonCharacter(ref)
                        return (
                          <span key={ref.pengim} className="elicitation-view__reference-clip">
                            <span className="elicitation-view__reference-pengim">
                              {ref.pengim}
                              {character && <span className="elicitation-view__reference-character">{character}</span>}
                            </span>
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
                      })}
                    </span>
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
                onChange={(e) => setConsent(e.target.checked)}
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

            <button type="button" className="elicitation-view__skip" onClick={rePick}>
              Re-pick
            </button>

            {(recorder.error ?? saveError) && (
              <span className="elicitation-view__error" role="alert">
                {recorder.error ?? saveError}
              </span>
            )}
          </div>

          {stagedTakes.length > 0 && (
            <div className="elicitation-view__staged">
              <span className="elicitation-view__staged-heading">
                Staged take{stagedTakes.length === 1 ? '' : 's'} for {current.pengim}
              </span>
              <ul className="elicitation-view__staged-list">
                {stagedTakes.map((take, i) => (
                  <li key={take.localPath} className="elicitation-view__staged-item">
                    <span>{take.recordedDate}</span>
                    <PlayClipButton
                      id={`elicit-staged:${take.localPath}`}
                      clip={{ url: stagedFileUrl(take.localPath) }}
                      label={stagedTakes.length > 1 ? `Take ${i + 1}` : 'Play'}
                      ariaLabel={`Play staged take ${i + 1} of ${current.pengim}`}
                      playingId={playingId}
                      onPlay={play}
                    />
                    <button
                      type="button"
                      onClick={() => deleteStagedTake(take.localPath)}
                      disabled={deletingPath === take.localPath}
                    >
                      {deletingPath === take.localPath ? 'Deleting…' : 'Delete'}
                    </button>
                  </li>
                ))}
              </ul>
              {deleteError && (
                <span className="elicitation-view__error" role="alert">
                  {deleteError}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
