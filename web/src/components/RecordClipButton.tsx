import { useState } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { AUDIO_CONSENT_URL } from '../audioConsent'
import { bytesToBase64, todayIsoDate } from '../lib/audioEncoding'

const SPEAKER_STORAGE_KEY = 'teochew-dictionary:recording-speaker-id'

function readStoredSpeaker(): string {
  try {
    return localStorage.getItem(SPEAKER_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export type RecordStatus = 'none' | 'pending' | 'published'

export interface RecordClipButtonProps {
  pengim: string
  status: RecordStatus
  /** Called once a save succeeds, so the parent can flip this row to "pending" without a full status refetch. */
  onSaved: (pengim: string) => void
}

/** Wraps `useAudioRecorder`'s idle/recording/recorded phases with the save round trip's own states. */
type PanelState = 'closed' | 'open' | 'saving' | 'saved'

const BADGE_LABEL: Record<RecordStatus, string> = { none: 'Record', pending: 'Pending review', published: 'Re-record' }

const PENDING_REPLACE_CONFIRM =
  'You already have a take pending review for this syllable — recording a new one will replace it. Continue?'

/**
 * Per-row record control on the Sounds tab (issue #128, `data/phonology/
 * REVIEW.md` § 17) — dev-only, mounted from `SoundsView` behind
 * `import.meta.env.DEV` rather than gating itself, so it has no internal
 * early-return-before-hooks to reason about. Records via `useAudioRecorder`,
 * previews the blob client-side, then POSTs to `/api/local-recordings` on
 * save — which only ever stages a proposal, never touches
 * `data/phonology/audio/*.yaml` directly.
 */
export function RecordClipButton({ pengim, status, onSaved }: RecordClipButtonProps) {
  const [panelState, setPanelState] = useState<PanelState>('closed')
  const [speaker, setSpeaker] = useState(readStoredSpeaker)
  const [consentAcknowledged, setConsentAcknowledged] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const recorder = useAudioRecorder()

  const close = () => {
    recorder.reset()
    setSaveError(null)
    setPanelState('closed')
  }

  const openPanel = () => {
    if (status === 'pending' && !window.confirm(PENDING_REPLACE_CONFIRM)) return
    setPanelState('open')
  }

  const reRecord = () => {
    recorder.reset()
    setSaveError(null)
  }

  const canSave = panelState === 'open' && recorder.phase === 'recorded' && speaker.trim() !== '' && consentAcknowledged

  const save = async () => {
    const blob = recorder.getBlob()
    if (!canSave || !blob) return
    setPanelState('saving')
    setSaveError(null)
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const res = await fetch('/api/local-recordings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pengim,
          speaker: speaker.trim(),
          recordedDate: todayIsoDate(),
          consentAcknowledged: true,
          audioBase64: bytesToBase64(bytes),
          mimeType: blob.type || 'audio/webm',
        }),
      })
      const result = (await res.json()) as { ok: boolean; error?: string }
      if (!res.ok || !result.ok) throw new Error(result.error ?? `save failed (HTTP ${res.status})`)

      try {
        localStorage.setItem(SPEAKER_STORAGE_KEY, speaker.trim())
      } catch {
        // localStorage unavailable — inconvenient, not fatal.
      }
      onSaved(pengim)
      setPanelState('saved')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'save failed')
      setPanelState('open')
    }
  }

  const disableInputs = recorder.phase === 'recording' || panelState === 'saving'
  const error = recorder.error ?? saveError

  return (
    <span className="record-clip">
      <button
        type="button"
        className="record-clip__toggle"
        onClick={panelState === 'closed' ? openPanel : close}
        aria-expanded={panelState !== 'closed'}
      >
        {panelState === 'closed' ? BADGE_LABEL[status] : 'Close'}
      </button>

      {panelState !== 'closed' && (
        <span className="record-clip__panel" role="group" aria-label={`Record a clip for ${pengim}`}>
          <label className="record-clip__field">
            Speaker id
            <input
              type="text"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="speaker-1"
              disabled={disableInputs}
            />
          </label>

          <label className="record-clip__consent">
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

          {panelState === 'open' && recorder.phase === 'idle' && (
            <button type="button" onClick={recorder.start}>
              ● Start recording
            </button>
          )}

          {panelState === 'open' && recorder.phase === 'recording' && (
            <button type="button" onClick={recorder.stop}>
              ■ Stop
            </button>
          )}

          {recorder.previewUrl && recorder.phase === 'recorded' && (
            <span className="record-clip__preview">
              <audio controls src={recorder.previewUrl} />
              {panelState === 'open' && (
                <>
                  <button type="button" onClick={reRecord}>
                    Re-record
                  </button>
                  <button type="button" onClick={save} disabled={!canSave}>
                    Save to staging
                  </button>
                </>
              )}
              {panelState === 'saving' && <span>Saving…</span>}
              {panelState === 'saved' && <span className="record-clip__success">Saved — pending review</span>}
            </span>
          )}

          {error && (
            <span className="record-clip__error" role="alert">
              {error}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
