import { useCallback, useEffect, useRef, useState } from 'react'

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

export type RecorderPhase = 'idle' | 'recording' | 'recorded'

export interface AudioRecorder {
  phase: RecorderPhase
  /** A local, client-side-only preview URL for the just-recorded blob (no server round trip needed to hear it back). */
  previewUrl: string | null
  error: string | null
  start: () => Promise<void>
  stop: () => void
  /** The recorded clip, or null before anything has been recorded. */
  getBlob: () => Blob | null
  /**
   * Stops any live stream, discards the current take, and returns to
   * `idle` — used both for an explicit re-record and for tearing down a
   * still-recording or already-recorded take (e.g. the panel is closed).
   */
  reset: () => void
}

/**
 * The getUserMedia/MediaRecorder capture-and-preview state machine shared by
 * every in-browser recording control (`RecordClipButton`, the elicitation
 * UI's recorder, issue #288) — split out so a second consumer doesn't
 * duplicate mimeType selection, chunk buffering, and stream cleanup a second
 * time. Owns only capture and local preview; staging/saving is the caller's
 * job.
 */
export function useAudioRecorder(): AudioRecorder {
  const [phase, setPhase] = useState<RecorderPhase>('idle')
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

  // Release the mic if the consumer unmounts mid-recording (e.g. a search
  // filter hides the row) rather than leaving the input device held open.
  useEffect(() => stopStream, [stopStream])

  const discardPreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    blobRef.current = null
  }, [])

  const start = useCallback(async () => {
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
  }, [stopStream])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    stopStream()
    discardPreview()
    chunksRef.current = []
    setError(null)
    setPhase('idle')
  }, [stopStream, discardPreview])

  const getBlob = useCallback(() => blobRef.current, [])

  return { phase, previewUrl, error, start, stop, reset, getBlob }
}
