import { useCallback, useEffect, useRef, useState } from 'react'

export interface AudioPlayer {
  /** The id of the clip currently playing, or null when nothing is. */
  playingId: string | null
  /** Play `url` under `id`, stopping whatever was playing; playing the current id again stops it. */
  play: (id: string, url: string) => void
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
 * The element is created on first play, not on mount: almost every entry has
 * no clip at all today (data/phonology/audio/*.yaml doesn't exist yet — see
 * issues #36/#37), so the common render constructs nothing.
 */
export function useAudioPlayer(): AudioPlayer {
  const elementRef = useRef<HTMLAudioElement | null>(null)
  const requestIdRef = useRef(0)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      elementRef.current?.pause()
    }
  }, [])

  const play = useCallback(
    (id: string, url: string) => {
      const element = elementRef.current ?? new Audio()
      elementRef.current = element

      element.pause()
      if (id === playingId) {
        setPlayingId(null)
        return
      }

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
    [playingId],
  )

  return { playingId, play }
}
