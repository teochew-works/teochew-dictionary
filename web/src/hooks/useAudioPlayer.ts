import { useCallback, useEffect, useRef, useState } from 'react'

export interface AudioPlayer {
  /** The id of the clip currently playing, or null when nothing is. */
  playingId: string | null
  /** Play `url` under `id`, stopping whatever was playing; playing the current id again stops it. */
  play: (id: string, url: string) => void
  /**
   * Plays `urls` back-to-back under `id`, advancing on each clip's 'ended'
   * event — issue #191's combined "play all" clip. Chained native playback,
   * not a synthesized single clip: GitHub Release assets (where every clip
   * is hosted, data/phonology/REVIEW.md § 12) send no CORS headers, so a
   * fetch+decodeAudioData approach that could trim silence and crossfade
   * seams can't work from the browser — only `<audio src>` playback is
   * exempt from that restriction. Same play/stop contract as `play`.
   */
  playSequence: (id: string, urls: string[]) => void
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

  const playSequence = useCallback(
    (id: string, urls: string[]) => {
      const element = elementRef.current ?? new Audio()
      elementRef.current = element

      element.pause()
      if (id === playingId) {
        setPlayingId(null)
        return
      }
      if (urls.length === 0) return

      const requestId = ++requestIdRef.current

      const playAt = (i: number) => {
        if (requestIdRef.current !== requestId) return
        if (i >= urls.length) {
          setPlayingId(null)
          return
        }
        // Guards against onended/onerror and a rejected play() promise all
        // firing for the same clip — whichever settles first advances,
        // the rest are no-ops, so a load failure never double-skips.
        let settled = false
        const next = () => {
          if (settled) return
          settled = true
          playAt(i + 1)
        }
        element.onended = next
        // A dead clip (see the note on `play` above) skips to the next one
        // rather than stalling the whole sequence.
        element.onerror = next
        element.src = urls[i]!
        void Promise.resolve(element.play()).catch(next)
      }
      playAt(0)
      setPlayingId(id)
    },
    [playingId],
  )

  return { playingId, play, playSequence }
}
