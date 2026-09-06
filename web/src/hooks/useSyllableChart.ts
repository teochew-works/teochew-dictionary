import { useEffect, useRef, useState } from 'react'
import type { SyllableChart } from '../types/syllable-chart'

export interface SyllableChartState {
  data: SyllableChart | null
  loading: boolean
  error: string | null
}

/**
 * Fetches the synced dist/syllable-chart.json the first time `enabled`
 * turns true, and never re-fetches after that — mirrors useSounds, but
 * gated because Chart is one of three Sounds-tab modes and most visits
 * never touch it (issue #171).
 *
 * `attemptedRef` is only set from inside a non-cancelled fetch's own
 * callback, never synchronously up front — deep-linking straight into
 * chart mode (issue #226) means `enabled` can be `true` on the very
 * first render, which under StrictMode's dev-only mount → cleanup →
 * remount cycle runs this effect twice. Setting the ref synchronously
 * at the top (as this used to) let the first, StrictMode-cancelled
 * invocation permanently block the second, real one from ever starting
 * its own fetch — the view was stuck on "Loading…" forever. Gating on
 * the outcome instead means only a fetch that actually got to finish
 * (checked its own `cancelled` and found it false) can set the flag.
 */
export function useSyllableChart(enabled: boolean): SyllableChartState {
  const [state, setState] = useState<SyllableChartState>({ data: null, loading: false, error: null })
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!enabled || attemptedRef.current) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))

    fetch(`${import.meta.env.BASE_URL}data/syllable-chart.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
        return res.json() as Promise<SyllableChart>
      })
      .then((data) => {
        if (cancelled) return
        attemptedRef.current = true
        setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        attemptedRef.current = true
        const message = err instanceof Error ? err.message : String(err)
        setState({ data: null, loading: false, error: message })
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
