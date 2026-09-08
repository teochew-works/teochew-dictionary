import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioReference } from '@teochew/core'
import { withTrim } from '@teochew/core'

/** ~20-30ms: short enough not to blur two distinct syllables together, long enough to mask the seam. */
const DEFAULT_CROSSFADE_MS = 30

export interface AudioPlayer {
  /** The id of the clip currently playing, or null when nothing is. */
  playingId: string | null
  /** Play `url` under `id`, stopping whatever was playing; playing the current id again stops it. */
  play: (id: string, url: string) => void
  /**
   * Plays `clips` back-to-back under `id`, crossfading across each seam
   * (issue #252 phase 2) — the combined "play all" clip. Two `<audio>`
   * elements ping-pong: while one plays the current clip, the next clip is
   * started on the other a `crossfadeMs` before the current one's (trimmed)
   * end, muted, then ramped in as the current one ramps out — masking the
   * natural gap #191 originally set out to fix. Built entirely from native
   * `<audio>` seeking and volume, so it stays clear of the CORS wall GitHub
   * Release assets impose on `fetch`/`decodeAudioData` (see ADR-0026 and
   * `withTrim`). Same play/stop contract as `play`.
   */
  playCrossfaded: (id: string, clips: AudioReference[], crossfadeMs?: number) => void
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
 * so the common render constructs nothing. `playCrossfaded` owns two further
 * elements of its own, created the same way, so a caller that never uses
 * combined playback never pays for them either.
 */
export function useAudioPlayer(): AudioPlayer {
  const elementRef = useRef<HTMLAudioElement | null>(null)
  const elementARef = useRef<HTMLAudioElement | null>(null)
  const elementBRef = useRef<HTMLAudioElement | null>(null)
  const requestIdRef = useRef(0)
  // Only one of these is ever pending at a time — a crossfade sequence is
  // strictly one clip playing plus, at most, one scheduled handoff to the
  // next. Tracked outside the sequence's own closures so any of `play`,
  // `playCrossfaded`, or unmount can cancel a handoff mid-flight.
  const crossfadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const crossfadeRafRef = useRef<number | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const clearCrossfadeSchedule = useCallback(() => {
    if (crossfadeTimeoutRef.current !== null) clearTimeout(crossfadeTimeoutRef.current)
    if (crossfadeRafRef.current !== null) cancelAnimationFrame(crossfadeRafRef.current)
    crossfadeTimeoutRef.current = null
    crossfadeRafRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      elementRef.current?.pause()
      elementARef.current?.pause()
      elementBRef.current?.pause()
      clearCrossfadeSchedule()
    }
  }, [clearCrossfadeSchedule])

  const play = useCallback(
    (id: string, url: string) => {
      // A crossfade sequence in progress uses its own pair of elements and a
      // scheduled handoff — starting any other clip must stop both, not just
      // this hook's single-clip element.
      elementARef.current?.pause()
      elementBRef.current?.pause()
      clearCrossfadeSchedule()

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
    [playingId, clearCrossfadeSchedule],
  )

  const playCrossfaded = useCallback(
    (id: string, clips: AudioReference[], crossfadeMs = DEFAULT_CROSSFADE_MS) => {
      // Symmetric guard against the single-clip player above: a component
      // button click mid-sequence must stop this crossfade, not layer over it.
      elementRef.current?.pause()
      clearCrossfadeSchedule()

      const elementA = elementARef.current ?? new Audio()
      elementARef.current = elementA
      const elementB = elementBRef.current ?? new Audio()
      elementBRef.current = elementB

      elementA.pause()
      elementB.pause()
      if (id === playingId) {
        setPlayingId(null)
        return
      }
      if (clips.length === 0) return

      const requestId = ++requestIdRef.current

      const rampCrossfade = (outgoing: HTMLAudioElement, incoming: HTMLAudioElement, durationMs: number) => {
        if (durationMs <= 0) {
          outgoing.volume = 0
          incoming.volume = 1
          return
        }
        const start = performance.now()
        const step = () => {
          if (requestIdRef.current !== requestId) return
          const t = Math.min(1, (performance.now() - start) / durationMs)
          outgoing.volume = 1 - t
          incoming.volume = t
          crossfadeRafRef.current = t < 1 ? requestAnimationFrame(step) : null
        }
        step()
      }

      // `element` plays clip `i`; `other` is where clip `i+1` starts once
      // scheduled. Ping-ponging (rather than a fixed "left"/"right" pair)
      // means each element is always either currently playing or fully idle,
      // never mid-fade-out while also being asked to start something new.
      const playClip = (i: number, element: HTMLAudioElement, other: HTMLAudioElement, startVolume: number) => {
        if (requestIdRef.current !== requestId) return
        if (i >= clips.length) {
          setPlayingId(null)
          return
        }

        const clip = clips[i]!
        const isLast = i === clips.length - 1
        const startS = (clip.trimStartMs ?? 0) / 1000
        let settled = false

        // Fires on a load error (a dead pinned Release asset, same hazard
        // `play` above guards against) — skips ahead immediately rather than
        // waiting for a handoff that a failed clip will never reach.
        const advance = () => {
          if (settled || requestIdRef.current !== requestId) return
          settled = true
          playClip(i + 1, other, element, 0)
        }

        const scheduleHandoff = (durationS: number) => {
          if (settled || requestIdRef.current !== requestId) return
          if (isLast) {
            element.onended = advance
            return
          }
          const fadeS = Math.min(crossfadeMs / 1000, Math.max(durationS / 2, 0))
          crossfadeTimeoutRef.current = setTimeout(
            () => {
              if (settled || requestIdRef.current !== requestId) return
              settled = true
              playClip(i + 1, other, element, 0)
              rampCrossfade(element, other, fadeS * 1000)
            },
            Math.max(0, (durationS - fadeS) * 1000),
          )
        }

        // Cleared up front so a handler left over from an earlier clip on
        // this same (reused) element can't fire once this clip is current.
        element.onended = null
        element.onerror = advance
        element.volume = startVolume
        element.src = withTrim(clip)
        if (clip.trimEndMs !== undefined) {
          // Both boundaries known — the trimmed duration needs no metadata load.
          scheduleHandoff(clip.trimEndMs / 1000 - startS)
        } else {
          // Trimmed only at the start, or not at all: the clip plays to its
          // natural end, whose duration isn't known until the browser has
          // parsed the file's metadata.
          element.onloadedmetadata = () => scheduleHandoff(element.duration - startS)
        }
        void Promise.resolve(element.play()).catch(advance)
      }

      playClip(0, elementA, elementB, 1)
      setPlayingId(id)
    },
    [playingId, clearCrossfadeSchedule],
  )

  return { playingId, play, playCrossfaded }
}
