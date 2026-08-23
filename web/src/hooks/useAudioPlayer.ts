import { useCallback, useEffect, useRef, useState } from 'react'

export interface AudioPlayer {
  /** The url currently playing, or null when nothing is. */
  playingUrl: string | null
  /** Play `url`, stopping whatever was playing; playing the current url again stops it. */
  play: (url: string) => void
}

/**
 * One `HTMLAudioElement` shared by every clip button under a single caller, so
 * starting a clip stops the previous one rather than layering two recordings
 * over each other — a real hazard on a multi-syllable reading, which can offer
 * a whole-word clip plus one button per syllable.
 *
 * The element is created on first play, not on mount: almost every entry has
 * no clip at all today (data/phonology/audio/*.yaml doesn't exist yet — see
 * issues #36/#37), so the common render constructs nothing.
 */
export function useAudioPlayer(): AudioPlayer {
  const elementRef = useRef<HTMLAudioElement | null>(null)
  const requestIdRef = useRef(0)
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      elementRef.current?.pause()
    }
  }, [])

  const play = useCallback(
    (url: string) => {
      const element = elementRef.current ?? new Audio()
      elementRef.current = element

      element.pause()
      if (url === playingUrl) {
        setPlayingUrl(null)
        return
      }

      // Reusing the element to switch clips aborts any in-flight play()
      // request for the previous clip, which rejects its promise — a request
      // id guards onended/onerror/that rejection from clearing the *new*
      // clip's state once a later call has already moved past it.
      const requestId = ++requestIdRef.current
      const stopIfCurrent = () => {
        if (requestIdRef.current === requestId) setPlayingUrl(null)
      }
      element.onended = stopIfCurrent
      // A clip url is a pinned GitHub Release asset (data/phonology/REVIEW.md
      // § 12), so it can 404 if a release is retagged. Clear the playing state
      // either way, so a dead url leaves the button un-stuck rather than
      // rejecting unhandled.
      element.onerror = stopIfCurrent

      element.src = url
      void Promise.resolve(element.play()).catch(stopIfCurrent)
      setPlayingUrl(url)
    },
    [playingUrl],
  )

  return { playingUrl, play }
}
