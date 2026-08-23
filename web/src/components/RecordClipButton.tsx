import { useCallback, useEffect, useRef, useState } from 'react'

const SPEAKER_STORAGE_KEY = 'teochew-dictionary:recording-speaker-id'
const AUDIO_CONSENT_URL = 'https://github.com/teochew-works/teochew-dictionary/blob/main/AUDIO-CONSENT.md'

// Preference order: opus in a small container first, falling back to
// whatever the browser's default MediaRecorder picks (Safari has no opus
// support, so `new MediaRecorder(stream)` with no mimeType is the only
// option there — the server maps whatever comes back via its own mimeType
// table, see web/vite-plugins/local-recordings-handlers.ts).
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
}

/** Chunked to avoid the call-stack overflow a single `String.fromCharCode(...bytes)` spread risks on a large clip. */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

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

type Phase = 'closed' | 'idle' | 'recording' | 'recorded' | 'saving' | 'saved'

const BADGE_LABEL: Record<RecordStatus, string> = { none: 'Record', pending: 'Pending review', published: 'Re-record' }

const PENDING_REPLACE_CONFIRM =
  'You already have a take pending review for this syllable — recording a new one will replace it. Continue?'

/**
 * Per-row record control on the Sounds tab (issue #128, `data/phonology/
 * REVIEW.md` § 17) — dev-only, mounted from `SoundsView` behind
 * `import.meta.env.DEV` rather than gating itself, so it has no internal
 * early-return-before-hooks to reason about. Records via `MediaRecorder`,
 * previews the blob client-side (no server round trip needed to hear it
 * back), then POSTs to `/api/local-recordings` on save — which only ever
 * stages a proposal, never touches `data/phonology/audio/*.yaml` directly.
 */
export function RecordClipButton({ pengim, status, onSaved }: RecordClipButtonProps) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [speaker, setSpeaker] = useState(readStoredSpeaker)
  const [consentAcknowledged, setConsentAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Release the mic if the row unmounts mid-recording (e.g. a search filter
  // hides it) rather than leaving the input device held open.
  useEffect(() => stopStream, [stopStream])

  const discardPreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    blobRef.current = null
  }, [])

  const close = () => {
    stopStream()
    discardPreview()
    chunksRef.current = []
    setError(null)
    setPhase('closed')
  }

  const openPanel = () => {
    if (status === 'pending' && !window.confirm(PENDING_REPLACE_CONFIRM)) return
    setPhase('idle')
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const recordedBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        blobRef.current = recordedBlob
        setPreviewUrl(URL.createObjectURL(recordedBlob))
        stopStream()
        setPhase('recorded')
      }

      recorderRef.current = recorder
      recorder.start()
      setPhase('recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not access the microphone')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
  }

  const reRecord = () => {
    discardPreview()
    chunksRef.current = []
    setError(null)
    setPhase('idle')
  }

  const canSave = phase === 'recorded' && speaker.trim() !== '' && consentAcknowledged

  const save = async () => {
    const blob = blobRef.current
    if (!canSave || !blob) return
    setPhase('saving')
    setError(null)
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
      setPhase('saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
      setPhase('recorded')
    }
  }

  return (
    <span className="record-clip">
      <button
        type="button"
        className="record-clip__toggle"
        onClick={phase === 'closed' ? openPanel : close}
        aria-expanded={phase !== 'closed'}
      >
        {phase === 'closed' ? BADGE_LABEL[status] : 'Close'}
      </button>

      {phase !== 'closed' && (
        <span className="record-clip__panel" role="group" aria-label={`Record a clip for ${pengim}`}>
          <label className="record-clip__field">
            Speaker id
            <input
              type="text"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="speaker-1"
              disabled={phase === 'recording' || phase === 'saving'}
            />
          </label>

          <label className="record-clip__consent">
            <input
              type="checkbox"
              checked={consentAcknowledged}
              onChange={(e) => setConsentAcknowledged(e.target.checked)}
              disabled={phase === 'recording' || phase === 'saving'}
            />
            I have read{' '}
            <a href={AUDIO_CONSENT_URL} target="_blank" rel="noreferrer">
              AUDIO-CONSENT.md
            </a>{' '}
            and obtained the speaker's explicit consent.
          </label>

          {phase === 'idle' && (
            <button type="button" onClick={startRecording}>
              ● Start recording
            </button>
          )}

          {phase === 'recording' && (
            <button type="button" onClick={stopRecording}>
              ■ Stop
            </button>
          )}

          {previewUrl && (phase === 'recorded' || phase === 'saving' || phase === 'saved') && (
            <span className="record-clip__preview">
              <audio controls src={previewUrl} />
              {phase === 'recorded' && (
                <>
                  <button type="button" onClick={reRecord}>
                    Re-record
                  </button>
                  <button type="button" onClick={save} disabled={!canSave}>
                    Save to staging
                  </button>
                </>
              )}
              {phase === 'saving' && <span>Saving…</span>}
              {phase === 'saved' && <span className="record-clip__success">Saved — pending review</span>}
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
