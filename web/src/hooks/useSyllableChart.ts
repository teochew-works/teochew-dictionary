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
 */
export function useSyllableChart(enabled: boolean): SyllableChartState {
  const [state, setState] = useState<SyllableChartState>({ data: null, loading: false, error: null })
  const startedRef = useRef(false)

  useEffect(() => {
    if (!enabled || startedRef.current) return
    startedRef.current = true
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))

    fetch(`${import.meta.env.BASE_URL}data/syllable-chart.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
        return res.json() as Promise<SyllableChart>
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setState({ data: null, loading: false, error: message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
