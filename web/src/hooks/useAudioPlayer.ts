import { useCallback, useEffect, useRef, useState } from 'react'
import { getAudioContext } from '../audio/combineClips'

export interface AudioPlayer {
  /** The id of the clip currently playing, or null when nothing is. */
  playingId: string | null
  /** Play `url` under `id`, stopping whatever was playing; playing the current id again stops it. */
  play: (id: string, url: string) => void
  /** Same contract as `play`, but for a synthesized `AudioBuffer` (issue #191's combined clip) rather than a url. */
  playBuffer: (id: string, buffer: AudioBuffer) => void
}

/**
 * One `HTMLAudioElement` shared by every clip button under a single caller, so
 * starting a clip stops the previous one rather than layering two recordings
 * over each other — a real hazard on a multi-syllable reading, which can offer
 * a whole-word clip plus one button per syllable.
 *
 * Playback is tracked by caller-supplied `id`, not by `url`: a reduplicated
 * reading (mang7 mang7) or a word clip that happens to reuse a syllable's
 * recording can point two distinct buttons at the same url, and keying on url
 * alone would make those buttons indistinguishable to this hook.
 *
 * The element is created on first play, not on mount: most entries still have
 * no clip today — recorded coverage (data/phonology/audio/chaozhou.yaml) is
 * real but partial, and Shantou/Chaoyang have none yet (issues #37, #106) —
 * so the common render constructs nothing.
 */
export function useAudioPlayer(): AudioPlayer {
  const elementRef = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const requestIdRef = useRef(0)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      elementRef.current?.pause()
      sourceRef.current?.stop()
    }
  }, [])

  // Shared by play/playBuffer so a url-based clip and a synthesized buffer
  // (issue #191's combined clip) exclude each other through the same
  // "only one thing plays" state, regardless of which kind started it.
  const stopCurrent = useCallback(() => {
    elementRef.current?.pause()
    if (sourceRef.current) {
      // Stopping a buffer source fires 'ended' asynchronously; clear the
      // handler first so that doesn't clobber whatever plays next (the
      // requestId guard below would also catch it, but this avoids relying
      // on that alone).
      sourceRef.current.onended = null
      sourceRef.current.stop()
      sourceRef.current = null
    }
  }, [])

  const play = useCallback(
    (id: string, url: string) => {
      stopCurrent()
      if (id === playingId) {
        setPlayingId(null)
        return
      }

      const element = elementRef.current ?? new Audio()
      elementRef.current = element

      // Reusing the element to switch clips aborts any in-flight play()
      // request for the previous clip, which rejects its promise — a request
      // id guards onended/onerror/that rejection from clearing the *new*
      // clip's state once a later call has already moved past it.
      const requestId = ++requestIdRef.current
      const stopIfCurrent = () => {
        if (requestIdRef.current === requestId) setPlayingId(null)
      }
      element.onended = stopIfCurrent
      // A clip url is a pinned GitHub Release asset (data/phonology/REVIEW.md
      // § 12), so it can 404 if a release is retagged. Clear the playing state
      // either way, so a dead url leaves the button un-stuck rather than
      // rejecting unhandled.
      element.onerror = stopIfCurrent

      element.src = url
      void Promise.resolve(element.play()).catch(stopIfCurrent)
      setPlayingId(id)
    },
    [playingId, stopCurrent],
  )

  const playBuffer = useCallback(
    (id: string, buffer: AudioBuffer) => {
      stopCurrent()
      if (id === playingId) {
        setPlayingId(null)
        return
      }

      const context = getAudioContext()
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)

      const requestId = ++requestIdRef.current
      source.onended = () => {
        if (requestIdRef.current === requestId) setPlayingId(null)
      }

      sourceRef.current = source
      source.start()
      setPlayingId(id)
    },
    [playingId, stopCurrent],
  )

  return { playingId, play, playBuffer }
}
