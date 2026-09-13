import { useCallback, useEffect, useRef, useState } from 'react'
import { dtwDistance, extractMfccFromSamples } from '@teochew/core'
import { loadSearchBank } from '../search/speakToSearchBank'
import './MicSearchButton.css'

// Same preference order as RecordClipButton.tsx: opus in a small container
// first, falling back to whatever the browser's default MediaRecorder picks.
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
}

/** Downmixes to mono by averaging channels, matching how the Python/CLI side reads a WAV. */
function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const mono = new Float32Array(buffer.length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i += 1) mono[i] = (mono[i] ?? 0) + data[i]! / buffer.numberOfChannels
  }
  return mono
}

type Phase = 'idle' | 'recording' | 'processing' | 'error'

export interface Candidate {
  key: string
  distance: number
}

export interface MicSearchButtonProps {
  /** Called with the best-matching syllable once recognition finishes. */
  onResult: (pengim: string) => void
}

const TOP_N = 5

/**
 * A microphone button that finds which Peng'im syllable a recording most
 * resembles, via DTW-over-MFCC template matching against one speaker's
 * (jky) reference clips (issue #279's web follow-up) — the same technique as
 * `npm run audio:classify`, reimplemented in pure JS since this static site
 * has no server to shell out to the CLI's Python tool. Off by default; see
 * `../settings/speakToSearch.ts`.
 *
 * Reuses `RecordClipButton`'s getUserMedia/MediaRecorder sequence directly
 * rather than sharing a hook with it — the two components' surrounding flows
 * (consent/save vs. one-shot recognition) differ enough that a shared
 * abstraction now would mostly serve a hypothetical third caller.
 */
export function MicSearchButton({ onResult }: MicSearchButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Release the mic if this unmounts mid-recording (e.g. leaving the Dictionary tab).
  useEffect(() => stopStream, [stopStream])

  const processRecording = useCallback(
    async (blob: Blob) => {
      setPhase('processing')
      const audioContext = new AudioContext()
      try {
        const bank = await loadSearchBank()
        const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
        const query = extractMfccFromSamples(toMono(audioBuffer), audioBuffer.sampleRate, bank.mfccParams)

        // Still whole-syllable DTW/MFCC only (#279) — #280's axis classifiers
        // (initial/rime/tone, combined via the attested-triple table) wire in
        // here once their held-out eval clears the bar set in that issue.
        const ranked = Object.entries(bank.clips)
          .map(([key, clip]) => ({ key, distance: dtwDistance(query, clip.mfcc) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, TOP_N)

        setCandidates(ranked)
        setPhase('idle')
        if (ranked[0]) onResult(ranked[0].key)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'could not recognise that recording')
        setPhase('error')
      } finally {
        void audioContext.close()
      }
    },
    [onResult],
  )

  const startRecording = async () => {
    setError(null)
    setCandidates([])
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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        stopStream()
        void processRecording(blob)
      }

      recorderRef.current = recorder
      recorder.start()
      setPhase('recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not access the microphone')
      setPhase('error')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
  }

  const label = phase === 'recording' ? 'Stop recording' : phase === 'processing' ? 'Recognising…' : 'Speak to search'

  return (
    <span className="mic-search">
      <button
        type="button"
        className="mic-search__button"
        aria-label={label}
        aria-pressed={phase === 'recording'}
        disabled={phase === 'processing'}
        onClick={phase === 'recording' ? stopRecording : () => void startRecording()}
      >
        {phase === 'recording' ? '■' : phase === 'processing' ? '…' : '🎤'}
      </button>

      {candidates.length > 0 && (
        <span className="mic-search__candidates" role="group" aria-label="Recognised syllables">
          {candidates.map((c) => (
            <button key={c.key} type="button" className="mic-search__candidate" onClick={() => onResult(c.key)}>
              {c.key}
            </button>
          ))}
        </span>
      )}

      {error && (
        <span className="mic-search__error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
